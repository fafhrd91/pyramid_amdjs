""" assets libraries """


def includeme(config):
    # libs
    config.add_amd_js(
        'jquery', 'pyramid_amdjs:static/lib/jquery-1.8.2.min.js',
        'JQuery Library')
    config.add_amd_js(
        'underscore', 'pyramid_amdjs:static/lib/underscore-min.js')
    config.add_amd_js(
        'handlebars', 'pyramid_amdjs:static/lib/handlebars.runtime.js',
        'Handlebars runtime library')

    # pyramid
    config.add_amd_js(
        'pyramid', 'pyramid_amdjs:static/pyramid.js', 
        'Pyramid amdjs', ('handlebars',))
