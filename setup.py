import os
import sys
from setuptools import setup, find_packages

version='0.3.2'

install_requires = ['setuptools',
                    'pyramid >= 1.4',
]

if sys.version_info[:2] == (2, 6):
    install_requires.extend((
        'argparse',
        'ordereddict',
        'unittest2'))

if sys.version_info[:2] in ((2,6),(2,7),(3,3)):
    install_requires.extend(('simplejson',))

tests_require = install_requires + ['nose', 'mock']

def read(f):
    return open(os.path.join(os.path.dirname(__file__), f)).read().strip()


setup(name='pyramid_amdjs',
      version=version,
      description=('Pyramid JS/CSS resource management with curl.js'),
      long_description='\n\n'.join((read('README.rst'), read('CHANGES.txt'))),
      classifiers=[
          "License :: OSI Approved :: MIT License",
          "Intended Audience :: Developers",
          "Programming Language :: Python",
          "Programming Language :: Python :: 2.6",
          "Programming Language :: Python :: 2.7",
          "Programming Language :: Python :: 3.2",
          "Programming Language :: Python :: 3.3",
          "Programming Language :: Python :: Implementation :: CPython",
          "Framework :: Pyramid",
          "Topic :: Internet :: WWW/HTTP",
          'Topic :: Internet :: WWW/HTTP :: WSGI'],
      author='Nikolay Kim',
      author_email='fafhrd91@gmail.com',
      url='https://github.com/fafhrd91/pyramid_amdjs/',
      license='MIT',
      packages=find_packages(),
      install_requires = install_requires,
      tests_require = tests_require,
      test_suite = 'nose.collector',
      include_package_data = True,
      zip_safe = False,
      entry_points = {
          'console_scripts': [
              'amdjs = pyramid_amdjs.script:main',
          ],
          'babel.extractors': [
              'mustache = pyramid_amdjs.mustache:extract_i18n_mustache',
          ],
      },
  )
