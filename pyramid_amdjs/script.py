""" amdjs command """
from __future__ import print_function
import os
import sys
import argparse
import textwrap
import tempfile
from pprint import pprint
from pyramid.compat import configparser, NativeIO, bytes_
from pyramid.path import AssetResolver
from pyramid.paster import bootstrap
from pyramid.threadlocal import get_current_registry

from pyramid_amdjs.amd import ID_AMD_MODULE, ID_AMD_SPEC
from pyramid_amdjs.compat import OrderedDict, NODE_PATH
from pyramid_amdjs.mustache import build_hb_bundle, check_output, ID_BUNDLE


grpTitleWrap = textwrap.TextWrapper(
    initial_indent='* ',
    subsequent_indent='  ')

grpDescriptionWrap = textwrap.TextWrapper(
    initial_indent='    ',
    subsequent_indent='    ')


def main(init=True):
    args = AmdjsCommand.parser.parse_args()
    cmd = AmdjsCommand(args)
    cmd.run()


class AmdjsCommand(object):

    parser = argparse.ArgumentParser(description="amdjs management")
    parser.add_argument('config', metavar='config',
                        help='ini config file')

    parser.add_argument('-b', action="store_true",
                        dest='build',
                        help='Build js bundles')

    parser.add_argument('-m', action="store_true",
                        dest='amd_mods',
                        help='List amd modules')

    parser.add_argument('--deps', action="store_true",
                        dest='deps',
                        help='Print dependency tree')

    parser.add_argument('--no-min', action="store_true",
                        dest='nomin',
                        help='Do not minimize js bundles')

    def __init__(self, args):
        self.options = args
        self.env = bootstrap(args.config)
        self.registry = self.env['registry']
        self.resolver = AssetResolver()

    def run(self):
        if self.options.build:
            self.build_bundles()
        elif self.options.amd_mods:
            self.list_amd_mods()
        elif self.options.deps:
            self.deps_tree()
        else:
            self.parser.print_help()

    def extract_deps(self, mod):
        if mod['path']:
            path = self.resolver.resolve(mod['path']).abspath()
            if os.path.isfile(path) and path.endswith('.js'):
                text = open(path, 'rb').read()
                p1 = text.find('define(')
                if p1 >= 0:
                    p2 = text.find('function(')
                    if p2 >= 0:
                        chunk = ''.join(ch.strip()
                                        for ch in text[p1+7:p2].split())
                        if chunk.startswith("'"):
                            chunk = chunk.split(',',1)[-1]
                        deps = [d for d in
                                ''.join(ch for ch in chunk
                                        if ch not in "\"'[]").split(',')
                                if d]
                        if deps:
                            return deps

        return mod['require']

    def deps_tree(self):
        print()
        mods = self.registry.get(ID_AMD_MODULE)
        specs = self.registry.get(ID_AMD_SPEC)
        if not specs:
            print ("No specs found")
            return

        for spec, names in specs.items():
            print(grpTitleWrap.fill('Spec: %s'%spec))

            tree = []
            seen = set()

            def process(name):
                if name in seen:
                    return

                seen.add(name)
                mod = mods.get(name)
                if mod is not None:
                    deps = self.extract_deps(mod)
                    for n in deps:
                        process(n)

                tree.append(name)

            for name in names.keys():
                if not name.endswith('.js'):
                    process(name)

            for n in tree:
                print(grpDescriptionWrap.fill(n))

            print()

    def list_amd_mods(self):
        print()
        for name, intr in sorted(self.registry.get(ID_AMD_MODULE).items()):
            print(grpTitleWrap.fill('%s: %s'%(name, intr['path'])))
            desc = grpDescriptionWrap.fill(intr['description'])
            print (desc)
            if desc:
                print()

    def build_bundles(self):
        cfg = self.registry.settings

        node_path = cfg['amd.nodejs']
        if not node_path:
            node_path = NODE_PATH

        if not node_path: # pragma: no cover
            print ("Can't find nodejs")
            return

        if not cfg['amd.spec']:
            print ("Spec files are not specified in .ini file")
            return

        if not cfg['amd.spec-dir']:
            print ("Destination directory is not specified in .ini file")
            return

        storage = self.registry.get(ID_AMD_MODULE)
        if not storage: # pragma: no cover
            return

        resolver = self.resolver

        specs = OrderedDict()
        for item in cfg['amd.spec']:
            spec, specfile = item.split(':',1)
            specs[spec] = specfile

        UGLIFY = resolver.resolve(
            'pyramid_amdjs:node_modules/uglify-js/bin/uglifyjs').abspath()

        for spec, specfile in specs.items():
            print("\n\nProcessing: %s (%s)"%(spec, specfile))
            f = resolver.resolve(specfile).abspath()
            parser = configparser.SafeConfigParser()
            parser.read(f)

            bundles = []
            processed = []

            for section in parser.sections():
                if section.endswith('.js'):
                    items = dict(parser.items(section))
                    url = items.get('url', '')
                    modules = items.get('modules', '')
                    if not modules:
                        continue

                    modules = [s for s in [s.strip() for s in modules.split()]
                               if not s.startswith('#') and s]
                    bundles.append((section, url, modules))

            tmp_storage = self.registry.get(ID_BUNDLE)

            for jsname, url, modules in bundles:
                js = []
                for module in modules:
                    if module in tmp_storage:
                        text = build_hb_bundle(
                            module, tmp_storage[module], self.registry)
                        processed.append(module)
                        js.append((module, None, text))
                        continue

                    intr = storage.get(module)
                    if not intr: # pragma: no cover
                        print ("Can't find module '%s'"%module)
                        return

                    processed.append(module)
                    js.append((module, intr['path'],
                               resolver.resolve(intr['path']).abspath()))

                _, tpath = tempfile.mkstemp()

                print ('')
                print (grpTitleWrap.fill(jsname))

                f = open(tpath, 'ab')
                for name, path, fpath in js:
                    print(grpDescriptionWrap.fill(
                            '%s: %s'%(name, path or 'templates bundle')))

                    if path is None:
                        f.write(bytes_(fpath, 'utf8'))
                        f.write(bytes_(';\n', 'utf8'))
                    else:
                        with open(fpath, 'rb') as source:
                            f.write(source.read())
                            f.write(bytes_(';\n', 'utf8'))

                f.close()

                path = os.path.join(cfg['amd.spec-dir'], jsname)
                print ('write to:', path)
                with open(path, 'wb') as dest:
                    if self.options.nomin:
                        dest.write(open(tpath, 'rb').read())
                    else:
                        js = check_output((NODE_PATH,UGLIFY,'-nc',tpath))
                        dest.write(js)

                os.unlink(tpath)

            notprocessed = []
            for name, path in storage.items():
                if name not in processed:
                    notprocessed.append((name, path))

            if spec in ('','main') and notprocessed:
                print ("\n\nList of not processed modules:")
                for name, intr, in sorted(notprocessed):
                    print(grpDescriptionWrap.fill('%s: %s'%(name,intr['path'])))
