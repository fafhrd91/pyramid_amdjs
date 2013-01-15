.. _command_line_chapter:

Command-line 
=============

`pyramid_amdjs` package can be controlled by command-line utilities. 
These utilities are documented in this chapter.

.. _amdjs_script:

amdjs bundles build tool
------------------------


.. _pstatic_script:

static resource management
--------------------------

You can use the ``pstatic`` command in a terminal window to copy a 
all registered static resource to specified directory.

.. code-block:: text
   :linenos:
   
   [fafhrd@... MyProject]$ ../bin/pstatic development.ini /path-to_dir/

   pyramid_amdjs:static/ ../_amdjs/static

   ...
