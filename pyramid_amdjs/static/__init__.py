""" assets libraries """
from pyramid_amdjs.compat import NODE_PATH


def includeme(config):
    # jquery http://jquery.org
    config.include('pyramid_amdjs.jquery')

    # backbone http://backbonejs.org
    config.include('pyramid_amdjs.backbone')

    # lodash https://github.com/amdjs/underscore
    config.include('pyramid_amdjs.underscore')

    # json2
    config.include('pyramid_amdjs.json2')

    # moment http://momentjs.com
    config.include('pyramid_amdjs.moment')

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

    # bootstrap http://getbootstrap.com
    config.include('pyramid_amdjs.bootstrap')

    # handlebars http://handlebarsjs.com/
    config.include('pyramid_amdjs.handlebars')

    # pyramid
    config.include('pyramid_amdjs.pyramid')
