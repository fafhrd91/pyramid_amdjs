define (
    'pform', ['jquery', 'pyramid', 'bootstrap'],

    function($, pyramid) {
        "use strict";

        var form = {}

        form.Window = pyramid.View.extend({
            __name__: 'pyramid.Window',

            data: {},
            template: null

            , init: function() {
                if (this.options.data)
                    this.data = this.options.data

                if (this.options.template)
                    this.template = this.options.template

                this.create()
            }

            , create: function() {
                var that = this

                this.__dom__.append(this.template(this.data))
                this.window = $('[data-type="window"]', this.__dom__)
                this.window.modal()
                this.window.on('hidden', function() {that.destroy()})
            }

            , destroy: function() {
                if (this.window)
                    this.window.modal('hide')
                this._super()
            }

            , action_close: function(options) {
                this.destroy()
            }
        })

        return form
    }
)
