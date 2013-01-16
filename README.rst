AmdJS for Pyramid
=================

.. image :: https://travis-ci.org/fafhrd91/pyramid_amdjs.png
  :target:  https://travis-ci.org/fafhrd91/pyramid_amdjs

`pyramid_amdjs` allows to manage js and css resources as amdjs modules 

.. code-block:: python

    config.include('pyramid_amdjs')

    config.add_amd_js(
        'jquery', 'pyramid_amdjs:static/lib/jquery-1.8.2.min.js',
        'JQuery Library')

Then you can use jquery in your amd module

.. code-block:: javascript

    define('my-package', ['jquery'],

           function($) {
              $('...').
           }
    )

To include your module to page:

.. code-block:: python

   def my_view(request):
       request.require_js('my-package')



Support and Documentation
-------------------------

On irc, use the freenode network and find us on channels, #ptahproject and #pyramid.

Documentation can be found in `docs` directory.  You can also see it online at `http://pyramid_amdjs.readthedocs.org/  <http://pyramid_amdjs.readthedocs.org/en/latest/index.html>`_

Report bugs at `pyramid_amdjs @ Github <https://github.com/fafhrd91/pyramid_amdjs/issues>`_


License
-------

pyramid_amdjs is offered under the MIT license.
