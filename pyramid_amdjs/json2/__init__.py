# json2 https://github.com/douglascrockford/JSON-js


def includeme(config):
    config.include('pyramid_amdjs')

    # static assets
    config.add_static_view('_amdjs_json2/static', 'pyramid_amdjs.json2:static/')
    
    config.add_amd_js(
        'json2', 'pyramid_amdjs.json2:static/json2.js')

