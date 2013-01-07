define(
    'pyramid', ['handlebars', 'moment'],

    function (handlebars, moment) {
        "use strict";

        var console = window.console

        var pyramid = {
            guid: function() {
                var S4 = function() {
                    return (((1+Math.random())*0x10000)|0)
                        .toString(16).substring(1)}
                return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4())
            }

            , utc: function() {
                var d = new Date()
                var localTime = d.getTime()
                var localOffset = d.getTimezoneOffset() * 60000
                d.setTime(localTime + localOffset)
                return d
            }

            , gen_url: function(path) {
                var host = window.AMDJS_APP_URL || '//' + window.location.host
                if (host[host.length-1] === '/')
                    host = host.substr(host.length-1, 1)

                return host + path
            }

            , get_options: function(el, prefix, opts) {
                if (el.jquery)
                    el = el.get(0)

                prefix = prefix || 'data-'
                var len = prefix.length
                var options = opts || {}
                for (var idx=0; idx < el.attributes.length; idx++) {
                    var item = el.attributes[idx]
                    if (item.name.substr(0, len) === prefix)
                        options[item.name.substr(len)] = item.value
                }
                return options
            }
        }

        /* Simple JavaScript Inheritance
         * By John Resig http://ejohn.org/
         * MIT Licensed.*/
        var initializing = false
        var fnTest = /xyz/.test(function(){xyz;}) ? /\b_super\b/ : /.*/;

        // The base Object implementation (does nothing)
        pyramid.Object = function(){}
        pyramid.Object.prototype = {
            __name__: 'pyramid.Object',
            __cleanup__: [],
            __initializers__: []

            , toString: function() {
                return this.__name__
            }

            , destroy: function() {
                for (var i=0; i<this.__cleanup__.length; i++) {
                    var item = this.__cleanup__[i]
                    if (typeof(item) === 'function')
                        item.call(this)
                    else if (item.remove && item.remove.call)
                        item.remove()
                }
                this.__cleanup__ = []
            }
            , add_cleanup_item: function(item) {
                this.__cleanup__.push(item)
            }
            , remove_cleanup_item: function(item) {
                var idx = this.__cleanup__.indexOf(item)
                while (idx != -1) {
                    this.__cleanup__.splice(idx)
                    idx = this.__cleanup__.indexOf(item)
                }
            }
        }

        // Create a new Object that inherits from this class
        pyramid.Object.extend = function(prop) {
            var _super = this.prototype

            // Instantiate a base class (but only create the instance,
            // don't run the init constructor)
            initializing = true
            var prototype = new this()
            initializing = false

            // Copy the properties over onto the new prototype
            for (var name in prop) {
                // Check if we're overwriting an existing function
                prototype[name] = typeof prop[name] == "function" &&
                    typeof _super[name] == "function"&&fnTest.test(prop[name])?
                    (function(name, fn){
                        return function() {
                            var tmp = this._super

                            //Add a new ._super() method that is the same method
                            //but on the super-class
                            this._super = _super[name]

                            //The method only need to be bound temporarily,so we
                            //remove it when we're done executing
                            var ret = fn.apply(this, arguments)
                            this._super = tmp

                            return ret
                        }
                    })(name, prop[name]):
                prop[name]
            }

            // The dummy class constructor
            function Object() {
                if (!initializing) {
                    this.__cleanup__ = []

                    // All construction is actually done in the init method
                    if (this.__init__ && this.__init__.apply)
                        try {
                            this.__init__.apply(this, arguments)
                        } catch(e) {
                            console.log('Excetion during first stage initialization: ', e)
                            throw e
                        }

                    if (this.init && this.init.apply)
                        try {
                            this.init.apply(this)
                        } catch(e) {
                            console.log('Excetion during second stage initialization: ', e)
                            throw e
                        }

                    // run initializers
                    for (var i=0; i<this.__initializers__.length; i++) {
                        this.__initializers__[i](this)
                    }
                }
            }

            // Populate our constructed prototype object
            Object.prototype = prototype

            // Enforce the constructor to be what we expect
            Object.prototype.constructor = Object

            // And make this class extendable
            Object.extend = pyramid.Object.extend

            // Copy initializers
            Object.prototype.__initializers__ =
                this.prototype.__initializers__.slice(0)

            for (var p in prototype) {
                if (pyramid.initializers[p] &&
                    (typeof prototype[p]!=="function"))
                    try {
                        pyramid.initializers[p](
                            Object, Object.prototype, prototype[p])
                    } catch(e) {console.log(e)}
            }
            return Object
        }

        pyramid.initializers = {}

        pyramid.EventChannel = function(prefix) {
            this.prefix = prefix || 'on_'
            this.handlers = []
            this.subscriptions = {}
        }

        pyramid.EventChannel.prototype = {
            toString: function() {return 'pyramid.EventChannel'},

            publish: function(topic) {
                var args = Array.prototype.slice.call( arguments, 1 ),
                    topicSubscriptions,
                    subscription,
                    length,
                    i = 0,
                    ret;

                // send to handlers
                for (var idx = 0; idx < this.handlers.length; idx++) {
                    var name = this.handlers[idx].prefix + topic
                    var context = this.handlers[idx].context

                    if (context[name] && context[name].apply)
                        context[name].apply(context, args)
                }

                // individual subscribers
                if (!this.subscriptions[topic]) {
                    return true
                }

                topicSubscriptions = this.subscriptions[topic].slice()

                for ( ; i < topicSubscriptions.length; i++) {
                    subscription = topicSubscriptions[i];
                    ret = subscription.callback.apply(subscription.context,args)
                    if (ret === false)
                        break
                }
                return ret !== false
            },

            has: function(topic) {
                return !!this.subscriptions[topic]
            },

            subscribe: function(topic, context, callback, priority) {
                if (typeof(topic) === 'object') {
                    var prefix = this.prefix
                    if (typeof(context) == 'string')
                        prefix = context

                    this.handlers[this.handlers.length] = {
                        context: topic, prefix: prefix}
                    return topic
                }

                if (arguments.length === 3 && typeof callback === "number") {
                    priority = callback
                    callback = context
                    context = null
                }
                if (arguments.length === 2) {
                    callback = context
                    context = null
                }
                priority = priority || 10

                var topicIndex = 0,
                    topics = topic.split( /\s/ ),
                    topicLength = topics.length,
                    added;
                for ( ; topicIndex < topicLength; topicIndex++) {
                    topic = topics[topicIndex]
                    added = false
                    if (!this.subscriptions[topic])
                        this.subscriptions[topic] = []

                    var i = this.subscriptions[topic].length - 1
                    var subscriptionInfo = {
                        callback: callback,
                        context: context,
                        priority: priority
                    }

                    for (; i >= 0; i--)
                        if (this.subscriptions[topic][i].priority <= priority) {
                            this.subscriptions[topic].splice(
                                i+1, 0, subscriptionInfo)
                            added = true
                            break
                        }

                    if (!added)
                        this.subscriptions[topic].unshift(subscriptionInfo)
                }
                return callback
            },

            unsubscribe: function(topic, callback) {
                if (typeof(topic) === 'object') {
                    for (var i = 0; i < this.handlers.length; i++)
                        if (this.handlers[i].context === topic) {
                            this.handlers.splice(i, 1)
                            i--
                        }
                    return
                }

                if (!this.subscriptions[topic])
                    return

                var length = this.subscriptions[topic].length

                for (var i = 0; i < length; i++)
                    if (this.subscriptions[topic][i].callback === callback) {
                        this.subscriptions[topic].splice(i, 1)
                        break
                    }
            }
        }

        pyramid.ActionChannel = function(dom, options) {
            this.dom = dom
            this.events = options.events
            this.scope = options.scope
            this.prefix = options.prefix || 'action_'

            if (dom) {
                dom.undelegate('[data-action]', 'click')
                dom.undelegate('[event-click]', 'click')
                dom.delegate('[data-action]', 'click', this, this.__dispatch__)
                dom.delegate('[event-click]', 'click', this, this.__dispatch__)
            }
        }

        pyramid.ActionChannel.prototype = {
            toString: function() {return 'pyramid.ActionChannel'}

            , __dispatch__: function(ev) {
                if (ev && ev.preventDefault) {
                    ev.preventDefault()
                    ev.stopPropagation()
                }

                var that = ev.data

                var params = pyramid.get_options(this)
                var options = pyramid.get_options(ev.target, null, params)
                var action = params.action

                if (that.events && that.events.has(action))
                    that.events.publish(action, options)

                var name = that.prefix+action
                var handler = that.scope[name]
                if (handler && handler.call) {
                    try {
                        handler.call(that.scope, options, ev, ev.target)
                    } catch (e) {
                        console.log("Action:", action, e)
                    }
                }
            }
        }

        pyramid.View = pyramid.Object.extend({
            __name__: 'pyramid.View'

            , __init__: function(parent, dom, options) {
                this.__parent__ = parent
                this.__uuid__ = pyramid.guid()
                this.__destroyed__ = false
                this.__views__ = new Array()

                if (dom && !dom.jquery)
                    options = dom

                if (typeof(options) === 'undefined')
                    options = {}

                if (dom && dom.jquery)
                    options.dom = dom

                if (options.container)
                    this.__container__ = options.container
                else
                    this.__container__ = $('body')

                var container = this.__container__

                if (options.id)
                    this.__id__ = options.id

                if (options.dom) {
                    this.__dom__ = options.dom
                    this.__id__ = this.__dom__.id
                } else {
                    if (this.__id__)
                        container.append('<div id="'+this.__id__+
                                   '" data-uuid="'+this.__uuid__+'"></div>')
                    else
                        container.append(
                            '<div data-uuid="'+this.__uuid__+'"></div>')

                    this.__dom__ = $(
                        '[data-uuid="'+this.__uuid__+'"]', container)
                }

                this.options = options
                this.events = new pyramid.EventChannel('on_')
                this.events.subscribe(this)
                this.actions = new pyramid.ActionChannel(
                    this.__dom__, {scope:this})

                if (this.__parent__)
                    this.__parent__.add_subview(this)
            }

            , destroy: function() {
                this.reset()
                if (this.__parent__)
                    this.__parent__.remove_subview(this)
                this.__dom__.remove()
                this.__destroyed__ = true
                this._super()
            }

            , add_subview: function(view) {
                for (var i=0; i < this.__views__.length; i++)
                    if (this.__views__[i] === view)
                        return

                this.__views__.push(view)
                this.events.publish('subview_added', view)
            }

            , remove_subview: function(view) {
                var i = 0
                while (i < this.__views__.length) {
                    if (this.__views__[i] === view) {
                        this.__views__.splice(i, 1)
                        this.events.publish('subview_removed', view)
                    } else {
                        i++
                    }
                }
            }

            , reset: function() {
                while (this.__views__.length) {
                    var view = this.__views__[0]
                    view.destroy()
                    this.remove_subview(view)
                }

                this.__views__ = []
                this.__dom__.empty()
            }

            , hide: function() {
                this.__dom__.hide()
            }

            , show: function() {
                this.__dom__.show()
            }

            , resize: function() {}
        })

        pyramid.ViewContainer = pyramid.View.extend({
            __name__: 'pyramid.ViewContainer',
            view: null,
            view_name: null

            , __init__: function(parent, dom, options) {
                this._super(parent, dom, options)

                if (!this.__workspace__)
                    this.__workspace__ = this.__dom__
            }

            , reset: function() {
                this._super()
                this.view = null
            }

            , activate: function(name, options) {
                if (typeof(name) === 'undefined')
                    return

                if (this.view && this.view_name === name) {
                    this.view.show(options)
                    return
                }

                for (var i=0; i < this.__views__.length; i++)
                    if (this.__views__[i].__view_name__ === name) {
                        if (this.view)
                            this.view.hide()
                        this.view = this.__views__[i]
                        this.view.show(options)
                        this.view_name = name
                        this.resize()
                        this.events.publish('activated', name)
                        return
                    }

                var that = this
                curl([name]).then(
                    function(factory) {
                        if (that.view)
                            that.view.hide()

                        var comp = new factory(
                            that, {container:that.__workspace__})
                        comp.__view_name__ = name
                        that.view = comp
                        that.view.show(options)
                        that.view_name = name
                        that.events.publish('activated', name)
                        setTimeout(function(){that.resize()}, 50)
                    }
                )
            }
        })

        pyramid.Templates = function (name, templates, categories) {
            this.name = name
            this.templates = templates
            if (categories) {
                for (var n in categories)
                    this[n] = categories[n]
            }
        }

        pyramid.get_templates = function(name, category) {
            var bundle = pyramid.Templates.bundles[name]
            if (!bundle)
                throw Error("Can't find templates bundle: "+name)

            if (category) {
                if (!bundle[category])
                    throw Error("Can't find templates category: "+category)
                return bundle[category]
            }
            return bundle
        }

        pyramid.Templates.bundles = {}

        pyramid.Templates.prototype = {
            get: function(name) {
                var that = this
                var render = function(context, partial, indent) {
                    return that.render(name, context, partial, indent)
                }
                return render
            },

            get_raw: function(name) {
                return this.templates[name]
            },

            render: function(name, context, partials) {
                if (typeof(context) === 'undefined')
                    context = {}

                if (typeof(partials) === 'undefined')
                    partials = this.templates

                if (!this.templates[name]) {
                    console.log("Can't find template:", name)
                    return ''
                } else {
                    try {
                        return this.templates[name](
                            context, {partials: partials})
                    } catch(e) {
                        console.log(e, name)
                    }
                }
                return ''
            }
        }

        pyramid.language = 'en'

        pyramid.i18n = function(bundle, context, fn, options) {
            var text = fn.call(context, context, options)

            if (bundle.__i18n__ &&
                bundle.__i18n__[text] &&
                bundle.__i18n__[text][pyramid.language])
                return bundle.__i18n__[text][pyramid.language]

            return text
        }

        // datetime format
        var formats = {'short': 'M/D/YY h:mm A',
                       'medium': 'MMM D, YYY h:mm:ss a',
                       'full': 'MMMM, D, YYYY h:mm:ss a Z'}
        if (typeof(datetime_short) != 'undefined')
            formats['short'] = datetime_short
        if (typeof(datetime_medium) != 'undefined')
            formats['medium'] = datetime_medium
        if (typeof(datetime_full) != 'undefined')
            formats['full'] = datetime_full

        // handlebars dateTime formatters
        handlebars.registerHelper(
            'dateTime', function(text, format) {
                if (text===null || typeof(text) === 'undefined')
                    text = this

                text = String.trim(text)

                // create date
                var date = new Date(text)
                if (isNaN(date.getTime())) {
                    console.log("Can't parse datetime value:", text)
                    return text
                }

                // covnert to local time
                var localTime = date.getTime()
                var localOffset = date.getTimezoneOffset() * 60000
                date = new Date(localTime - localOffset)

                format = formats[format]
                if (!format)
                    format = formats['short']

                // print date
                return moment(date).format(format)
            }
        )

        return pyramid
    }
)
