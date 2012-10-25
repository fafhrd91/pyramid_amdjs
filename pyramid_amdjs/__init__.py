# pyramid_amdjs


def includeme(cfg):
    from pyramid_amdjs import amd
    from pyramid.settings import asbool, aslist

    # settings
    settings = cfg.get_settings()
    settings['amd.enabled'] = asbool(settings.get('amd.enabled', 't'))
    settings['amd.spec-dir'] = settings.get('amd.spec-dir', '').strip()
    settings['amd.tmpl-cache'] = settings.get('amd.tmpl-cache', '').strip()
    settings['amd.tmpl-langs'] = [
        s.strip() for s in aslist(settings.get('amd.tmpl-langs', ''))]
    settings['amd.node'] = settings.get('amd.node', '').strip()

    # spec settings
    specs = []
    for key, val in sorted(settings.items()):
        if key.startswith('amd.spec.'):
            specs.append((key[9:].strip(), val.strip()))

    settings['amd.spec'] = specs

    # request methods
    cfg.add_request_method(amd.request_amd_init, 'init_amd')
    cfg.add_request_method(amd.request_includes, 'include_js')
    cfg.add_request_method(amd.request_css_includes, 'include_css')

    # config directives
    cfg.add_directive('add_amd_dir', amd.add_amd_dir)
    cfg.add_directive('add_amd_js', amd.add_js_module)
    cfg.add_directive('add_amd_css', amd.add_css_module)

    # amd init route
    cfg.add_route('pyramid-amd-init', '/_amd_{specname}.js')

    # amd bundle route
    cfg.add_route('pyramid-amd-spec', '/_amd_{specname}/{name}')

    # ptah static assets
    cfg.add_static_view('_amdjs/static', 'pyramid_amdjs:static/')

    # mustache bundle
    from .mustache import register_mustache_bundle

    cfg.add_directive(
        'add_mustache_bundle', register_mustache_bundle)
    cfg.add_route(
        'pyramid-mustache-bundle', '/_handlebars/{name}.js')

    # scan
    cfg.scan('pyramid_amdjs')
    cfg.include('pyramid_amdjs.static')

    # init amd specs
    cfg.action(
        'pyramid_amdjs.init_amd_spec',
        amd.init_amd_spec, (cfg,), order=999999+1)
