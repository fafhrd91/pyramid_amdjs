INI settings
------------
All .INI pyramid_amdjs settings

``static.url``

  static_url::
  
    static.url = http://static.example.org

``static.rewrite``

  Enable static resource rewriting. ``static.url`` has to be set::
  
    static.rewrite = t

``amd.debug``

  Enable amdjs debug mode. In this mode `pyramid_amdjs` checks for file
  modification for each request::

    static.debug = t


``amd.enabled``


``amd.spec-dir``


``amd.tmpl-cache``


``amd.tmpl-langs``


``amd.node``

  Path to nodejs executable. `pyramid_amdjs` uses nodejs for `handlebars templates compilation. If nodejs is not found `handlebars` compilation happen on client side.::

    amd.node = /usr/bin/node
