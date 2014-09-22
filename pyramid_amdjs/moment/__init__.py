# moment http://momentjs.com


def includeme(config):
    config.include('pyramid_amdjs')

    # static assets
    config.add_static_view('_amdjs_moment/static', 'pyramid_amdjs.moment:static/')

    config.add_amd_js(
        'moment', 'pyramid_amdjs.moment:static/moment.min.js')
