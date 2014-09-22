# backbone http://backbonejs.org


def includeme(config):
    config.include('pyramid_amdjs')

    # static assets
    config.add_static_view('_amdjs_backbone/static', 'pyramid_amdjs.backbone:static/')
    
    config.add_amd_js(
        'backbone', 'pyramid_amdjs.backbone:static/backbone-min.js')

