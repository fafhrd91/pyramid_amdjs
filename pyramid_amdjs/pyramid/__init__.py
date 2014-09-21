# pyramid and handlebarhelpers


def includeme(config):
    config.include('pyramid_amdjs')

    # static assets
    config.add_static_view('_amdjs_pyramid/static', 'pyramid_amdjs.pyramid:static/')
    
    config.add_amd_js(
        'pyramid', 'pyramid_amdjs.pyramid:static/pyramid.js',
        'Pyramid amdjs', ('backbone',))

    # handlebars support helper
    config.add_amd_js(
        'pyramid:templates', 'pyramid_amdjs.pyramid:static/templates.js',
        'Handlebars templates', ('handlebars',))

    # handlebars datetime helper
    config.add_amd_js(
        'pyramid:datetime', 'pyramid_amdjs.pyramid:static/datetime.js',
        'Datetime handlebars helper', ('handlebars', 'moment'))

