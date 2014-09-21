# handlebars http://handlebarsjs.com/
from pyramid_amdjs.compat import NODE_PATH

from .handlebars import *


def includeme(config):
    config.include('pyramid_amdjs')

    # static assets
    config.add_static_view('_amdjs_handlebars/static', 'pyramid_amdjs.handlebars:static/')

    node_path = config.get_settings()['amd.node']
    if not node_path:
        node_path = NODE_PATH
    if not node_path:
        config.add_amd_js(
            'handlebars', 'pyramid_amdjs.handlebars:static/handlebars.js',
            'Handlebars library')
    else:
        config.add_amd_js(
            'handlebars', 'pyramid_amdjs.handlebars:static/handlebars.runtime.js',
            'Handlebars runtime library')
