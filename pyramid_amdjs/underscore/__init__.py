# underscore https://github.com/amdjs/underscore


def includeme(config):
    config.include('pyramid_amdjs')

    # static assets
    config.add_static_view('_amdjs_underscore/static', 'pyramid_amdjs.underscore:static/')
    
    config.add_amd_js(
        'underscore', 'pyramid_amdjs.underscore:static/underscore-min.js')

