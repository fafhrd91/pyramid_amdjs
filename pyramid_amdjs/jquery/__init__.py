# jquery http://jquery.org

def includeme(config):
    config.include('pyramid_amdjs')

    # static assets
    config.add_static_view('_amdjs_jquery/static', 'pyramid_amdjs.jquery:static/')
    
    config.add_amd_js(
        'jquery',
        'pyramid_amdjs.jquery:static/jquery-1.9.1.min.js',
        'JQuery Library')

