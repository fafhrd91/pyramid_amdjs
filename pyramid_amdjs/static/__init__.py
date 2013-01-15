""" assets libraries """
from pyramid_amdjs.compat import NODE_PATH


def includeme(config):
    # jquery
    config.add_amd_js(
        'jquery', 'pyramid_amdjs:static/lib/jquery-1.9.0.min.js',
        'JQuery Library')
    config.add_amd_js(
        'jquery19', 'pyramid_amdjs:static/lib/jquery-1.9.0.min.js',
        'JQuery Library 1.9')

    # underscore
    config.add_amd_js(
        'underscore', 'pyramid_amdjs:static/lib/underscore-min.js')

    # moment
    config.add_amd_js(
        'moment', 'pyramid_amdjs:static/lib/moment.js')

    # bootstrap
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

    # handlebars
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
        'Pyramid amdjs', ('handlebars','moment'))

    # simple bootstrap modal
    config.add_amd_js(
        'pyramid:form', 'pyramid_amdjs:static/form.js',
        'Pyramid form', ('handlebars', 'pyramid', 'bootstrap'))
