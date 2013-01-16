""" assets libraries """
from pyramid_amdjs.compat import NODE_PATH


def includeme(config):
    # jquery http://jquery.org
    config.add_amd_js(
        'jquery', 'pyramid_amdjs:static/lib/jquery-1.9.0.min.js',
        'JQuery Library')
    config.add_amd_js(
        'jquery19', 'pyramid_amdjs:static/lib/jquery-1.9.0.min.js',
        'JQuery Library 1.9')

    # backbone http://backbonejs.org
    config.add_amd_js(
        'backbone', 'pyramid_amdjs:static/lib/backbone-min.js')

    # lodash https://github.com/amdjs/underscore
    config.add_amd_js(
        'underscore', 'pyramid_amdjs:static/lib/underscore-min.js')

    # json2
    config.add_amd_js(
        'json2', 'pyramid_amdjs:static/lib/json2.js')

    # moment http://momentjs.com
    config.add_amd_js(
        'moment', 'pyramid_amdjs:static/lib/moment.min.js')

    # bootstrap http://twitter.github.com/bootstrap/
    config.add_amd_js(
        'bootstrap', 'pyramid_amdjs:static/bootstrap/bootstrap.min.js',
        'Twitter bootstrap javscript library', ('jquery',))
    config.add_amd_css(
        'bootstrap-css',
        'pyramid_amdjs:static/bootstrap/bootstrap.min.css',
        'Twitter bootstrap javscript library')
    config.add_amd_css(
        'bootstrap-responsive-css',
        'pyramid_amdjs:static/bootstrap/bootstrap-responsive.min.css',
        'Twitter bootstrap javscript library (Responsive)')

    # handlebars http://handlebarsjs.com/
    node_path = config.get_settings()['amd.node']
    if not node_path:
        node_path = NODE_PATH

    if not node_path:
        config.add_amd_js(
            'handlebars', 'pyramid_amdjs:static/lib/handlebars.js',
            'Handlebars library')
    else:
        config.add_amd_js(
            'handlebars', 'pyramid_amdjs:static/lib/handlebars.runtime.js',
            'Handlebars runtime library')

    # pyramid
    config.add_amd_js(
        'pyramid', 'pyramid_amdjs:static/pyramid.js',
        'Pyramid amdjs', ('backbone'))

    # handlebars support helper
    config.add_amd_js(
        'pyramid:templates', 'pyramid_amdjs:static/templates.js',
        'Handlebars templates', ('handlebars'))

    # handlebars datetime helper
    config.add_amd_js(
        'pyramid:datetime', 'pyramid_amdjs:static/datetime.js',
        'Datetime handlebars helper', ('handlebars','moment'))
