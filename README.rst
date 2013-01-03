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



License
-------

pyramid_amdjs is offered under the MIT license.
