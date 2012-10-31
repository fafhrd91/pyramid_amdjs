import os
import logging
from pyramid.path import AssetResolver
from pyramid.compat import configparser, text_type, string_types, text_
from pyramid.view import view_config
from pyramid.registry import Introspectable
from pyramid.response import FileResponse
from pyramid.exceptions import ConfigurationError
from pyramid.httpexceptions import HTTPNotFound

from .compat import json
from .mustache import list_bundles

log = logging.getLogger('pyramid_amdjs')

ID_AMD_SPEC = 'pyramid_amdjs:amd-spec'
ID_AMD_SPEC_ = 'pyramid_amdsj:amd-spec_'
ID_AMD_MODULE = 'pyramid_amdjs:amd-module'

JS_MOD = 1
CSS_MOD = 2


def init_amd_spec(config, cache_max_age=None):
    cfg = config.get_settings()
    config.registry[ID_AMD_SPEC] = {}
    if not cfg['amd.spec']:
        return

    if not cfg['amd.spec-dir']:
        raise ConfigurationError("amd.spec-dir is required.")

    resolver = AssetResolver()
    directory = resolver.resolve(cfg['amd.spec-dir']).abspath()

    specs = {}
    for spec, specfile in cfg['amd.spec']:
        if spec in specs:
            raise ConfigurationError("Spec '%s' already defined."%spec)

        specs[spec] = specfile

    spec_mods = {}

    for spec, specfile in specs.items():
        f = resolver.resolve(specfile).abspath()

        parser = configparser.SafeConfigParser()
        parser.read(f)

        mods = {}
        if parser.has_option('init', 'base'):
            base_url = parser.get('init', 'base')
        else:
            base_url = ''

        for section in parser.sections():
            items = dict(parser.items(section))

            if section.endswith('.js'):
                modules = [s for s in
                           [s.strip() for s in items.get('modules', '').split()]
                           if not s.startswith('#')]
                if modules:
                    if base_url:
                        item = {'name': section,
                                'url': '%s/%s'%(base_url, section)}
                    else:
                        item = {'name': section,
                                'path': os.path.join(directory,section)}

                mods[section] = item
                for mod in modules:
                    mods[mod] = item

        spec_mods[spec] = mods
        spec_mods['%s-init'%spec] = os.path.join(directory, 'init-%s.js'%spec)

    config.registry[ID_AMD_SPEC] = spec_mods
    config.registry[ID_AMD_SPEC_] = cache_max_age


def add_js_module(cfg, name, path, description='', requires=()):
    """ register amd js module

    :param name: name
    :param path: asset path
    :param description: module description
    :param requires: module dependencies
    """
    discr = (ID_AMD_MODULE, name)

    intr = Introspectable(ID_AMD_MODULE, discr, name, ID_AMD_MODULE)
    intr['name'] = name
    intr['path'] = path
    intr['description'] = description
    intr['tp'] = JS_MOD

    if isinstance(requires, str):
        requires = (requires,)
    intr['requires'] = requires

    storage = cfg.registry.setdefault(ID_AMD_MODULE, {})
    storage[name] = intr

    cfg.action(discr, introspectables=(intr,))
    log.info("Add js module: %s path:%s"%(name, path))


def add_css_module(cfg, name, path, description=''):
    """ register css module

    :param name: name
    :param path: asset path
    :param description: module description
    """
    discr = (ID_AMD_MODULE, name)

    intr = Introspectable(ID_AMD_MODULE, discr, name, ID_AMD_MODULE)
    intr['name'] = name
    intr['path'] = path
    intr['description'] = description
    intr['tp'] = CSS_MOD

    storage = cfg.registry.setdefault(ID_AMD_MODULE, {})
    storage[name] = intr

    cfg.action(discr, introspectables=(intr,))
    log.info("Add css module: %s path:%s"%(name, path))


def extract_mod(name, text, path):
    mods = {}

    pos = 0
    while 1:
        p1 = text.find('define(', pos)
        if p1 < 0:
            break

        p2 = text.find('function(', p1)
        if p2 < 0:
            break

        pos = p2
        chunk = ''.join(ch.strip() for ch in text[p1+7:p2].split())
        if chunk.startswith("'") or chunk.startswith('"'):
            name, chunk = chunk.split(',',1)
            name = ''.join(ch for ch in name if ch not in "\"'[]")
        else:
            log.warning("Empty name is not supported, %s.js"%name)
            continue

        deps = [d for d in
                ''.join(ch for ch in chunk
                        if ch not in "\"'[]").split(',') if d]
        mods[name] = deps

    if not mods:
        log.warning("Can't detect amdjs module name for: %s"%path)
        raise ConfigurationError("Can't detect amdjs module name for: %s"%path)

    return mods.items()


def add_amd_dir(cfg, path):
    """ read and load amd modules from directory

    :param path: asset path
    """
    resolver = AssetResolver()
    directory = resolver.resolve(path).abspath()

    mods = []
    for filename in os.listdir(directory):
        p = os.path.join(path, filename)

        if filename.endswith('.js'):
            for name, deps in extract_mod(
                    filename[:-3],
                    text_(open(os.path.join(directory, filename),'r').read()),
                    p):
                mods.append((name, p, JS_MOD))
        if filename.endswith('.css'):
            mods.append((filename[:-4], p, CSS_MOD))

    for name, p, mod in sorted(mods):
        if mod == JS_MOD:
            add_js_module(cfg, name, p)
            log.info("Add js module: %s path:%s"%(name, p))
        elif mod == CSS_MOD:
            add_css_module(cfg, name, p)
            log.info("Add css module: %s path:%s"%(name, p))


AMD_INIT_TMPL = """
var pyramid_amd_modules = {\n%(mods)s}

if (typeof(AMDJS_APP_URL) !== 'undefined') {
  for (var name in pyramid_amd_modules) {
      var prefix = pyramid_amd_modules[name].substr(0, 7)
      if (prefix !== 'http://' && prefix !== 'https:/')
          pyramid_amd_modules[name] = AMDJS_APP_URL + pyramid_amd_modules[name]
  }
}

curl({dontAddFileExt:'.', paths: pyramid_amd_modules})
"""

@view_config(route_name='pyramid-amd-spec')
def amd_spec(request):
    name = request.matchdict['name']
    specname = request.matchdict['specname']

    spec = request.registry.get(ID_AMD_SPEC, {}).get(specname, ())
    if name not in spec or 'path' not in spec[name]:
        return HTTPNotFound()

    return FileResponse(
        spec[name]['path'], request, request.registry.get(ID_AMD_SPEC_))


def build_init(request, specname):
    storage = request.registry.get(ID_AMD_MODULE)

    spec_data = request.registry.get(ID_AMD_SPEC, {}).get(specname)
    if spec_data is None and specname != '_':
        return None

    js = []
    if spec_data is None:
        spec_data = {}

    app_url = request.application_url
    app_url_len = len(app_url)

    spec_cache = {}

    if storage:
        for name, intr in storage.items():
            path = intr['path']
            info = spec_data.get(name)
            if info:
                if 'path' in info:
                    url = spec_cache.get(info['name'])
                    if not url:
                        url = spec_cache[info['name']] = request.route_url(
                            'pyramid-amd-spec',
                            specname=specname, name=info['name'])
                else:
                    url = info['url']
            else:
                url = '%s'%request.static_url(path)

            if url.startswith(app_url):
                url = url[app_url_len:]

            if intr['tp'] == CSS_MOD:
                js.append('"%s.css": "%s"'%(name, url))
            elif intr['tp'] == JS_MOD:
                js.append('"%s": "%s"'%(name, url))

    # list handlebars bundles, in case if bundle is part of spec
    for name, url in list_bundles(request):
        info = spec_data.get(name)
        if info:
            if 'path' in info:
                url = spec_cache.get(info['name'])
                if not url:
                    url = spec_cache[info['name']] = request.route_url(
                        'pyramid-amd-spec',
                        specname=specname, name=info['name'])
            else:
                url = info['url']

        if url.startswith(app_url):
            url = url[app_url_len:]

        js.append('"%s":"%s"'%(name, url))

    return text_type(AMD_INIT_TMPL%{'mods': ',\n'.join(sorted(js))})


@view_config(route_name='pyramid-amd-init')
def amd_init(request, **kw):
    cfg = request.registry.settings
    specstorage = request.registry.get(ID_AMD_SPEC, {})
    specname = request.matchdict['specname']
    specdata = specstorage.get(specname)

    initfile = '%s-init'%specname
    if specdata and cfg['amd.enabled'] and initfile in specstorage:
        return FileResponse(
            specstorage[initfile], request, request.registry.get(ID_AMD_SPEC_))

    text = build_init(request, specname)
    if text is None:
        return HTTPNotFound()

    response = request.response
    response.content_type = 'application/javascript'
    response.text = text
    return response


def request_amd_init(request, spec='', bundles=(), debug=False):
    cfg = request.registry.settings

    c_tmpls = []
    if spec and cfg['amd.enabled']:
        specstorage = request.registry.get(ID_AMD_SPEC, {})
        specdata = specstorage.get(spec)
        if specdata is None:
            raise RuntimeError("Spec '%s' is not found."%spec)
    else:
        spec = '_'
        specdata = ()

    if debug:
        c_tmpls.append(
            '<script src="%s"> </script>'%
            request.static_url('pyramid_amdjs:static/lib/curl-debug.js'))
    else:
        c_tmpls.append(
            '<script src="%s"> </script>'%
            request.static_url('pyramid_amdjs:static/lib/curl.js'))
    c_tmpls.append(
        '<script type="text/javascript">'
        'AMDJS_APP_URL="%s";</script>'%(request.application_url,))
    c_tmpls.append(
        '<script src="%s/_amd_%s.js"> </script>'%(
            request.application_url, spec))

    for name in (bundles if not isinstance(bundles, str) else (bundles,)):
        name = '%s.js'%name
        if name in specdata:
            c_tmpls.append(
                '<script src="%s"></script>'%
                request.route_url('pyramid-amd-spec',specname=spec,name=name))

    return '\n'.join(c_tmpls)


def request_includes(request, js=(), css=()):
    if isinstance(js, string_types):
        js = (js,)

    mods = ["'%s'"%c for c in js]

    if isinstance(css, string_types):
        css = (css,)

    mods.extend("'css!%s.css'"%c for c in css)

    return ('<script type="text/javascript">curl({paths:pyramid_amd_modules},[%s])</script>' %
            ','.join(mods))


def request_css_includes(request, css=()):
    if isinstance(css, string_types):
        css = (css,)

    return ('<script type="text/javascript">curl({paths:pyramid_amd_modules},[%s])</script>' %
            ','.join("'css!%s.css'"%c for c in css))
