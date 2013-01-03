import os
import logging
import hashlib
from pyramid.compat import text_
from pyramid.path import AssetResolver

from pyramid_amdjs import amd

log = logging.getLogger('pyramid_amdjs:debug')


def add_amd_dir(cfg, path):
    data = cfg.get_settings()['amd.debug.data']
    paths = data.setdefault('paths', [])

    resolver = AssetResolver()
    directory = resolver.resolve(path).abspath()

    paths.append((path, directory))
    log.info("Add resource dir: %s"%path)


def load_dir(registry, dirname, directory):
    storage = registry.settings['amd.debug.data']

    cache = storage['cache'].get(dirname)
    if cache is None:
        cache = storage['cache'][dirname] = {'mtime': 0, 'files': []}

    all_mods = storage['mods']

    # check dir mtime
    mtime = os.path.getmtime(directory)
    if os.path.getmtime(directory) > cache['mtime']:
        # unload info
        for mod, info in list(all_mods.items()):
            if 'path' in info and info['path'].startswith(directory):
                del all_mods[mod]

        cache.update(mtime=mtime, files={})

    mods = []
    for filename in os.listdir(directory):
        filepath = os.path.join(directory, filename)

        # check mtime (caching)
        try:
            mtime = os.path.getmtime(filepath)
        except OSError:
            continue

        if filename in cache['files'] and mtime <= cache['files'][filename]:
            continue

        cache['files'][filename] = mtime

        p = os.path.join(dirname, filename)

        if filename.endswith('.js'):
            for name, deps in amd.extract_mod(
                    filename[:-3],
                    text_(open(os.path.join(directory, filename),'r').read()),
                    p):
                mods.append((name, p, amd.JS_MOD, filepath))
        if filename.endswith('.css'):
            mods.append((filename[:-4], p, amd.CSS_MOD, filepath))

    for name, fname, tp, fpath in mods:
        if name in all_mods and fpath != all_mods[name]['fpath']:
            log.error(
                "amd module '%s' already exists in '%s' file, skipping '%s'",
                name, all_mods[name]['fpath'], fpath)
        else:
            log.info("Update module information: %s path:%s", name, fname)

            md5 = hashlib.md5()
            md5.update(open(fpath, 'r').read())
            all_mods[name] = {
                'fname': fname, 'tp': tp, 'fpath': fpath,
                'md5': md5.hexdigest()}


def build_md5(request, specname):
    initf = build_init(request, specname)

    md5 = hashlib.md5()
    md5.update(initf.encode('utf-8'))

    return md5.hexdigest()


def build_init(request, specname):
    data = request.registry.settings['amd.debug.data']

    for name, directory in data['paths']:
        load_dir(request.registry, name, directory)

    app_url = request.application_url
    app_url_len = len(app_url)

    js = []
    for name, info in data['mods'].items():
        url = '%s'%request.static_url(info['fname'], _query={'_v': info['md5']})
        url = url[app_url_len:]

        if info['tp'] == amd.CSS_MOD:
            js.append('"%s.css": "%s"'%(name, url))
        elif info['tp'] == amd.JS_MOD:
            js.append('"%s": "%s"'%(name, url))

    return amd.build_init(request, '_', js)
