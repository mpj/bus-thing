var isArray = require('mout/lang/isArray')
var pluck = require('mout/array/pluck')
var find = require('mout/array/find')
var partial = require('mout/function/partial')
var deepEqual = require('deep-equal')
var isFunction = require('mout/lang/isFunction')
var isUndefined = require('mout/lang/isUndefined')

var createBus = function() {
  var me = {}

  var handlers = []
  var messageMap = {}

  var logEntries = []

  function isHandler(fn) {
    return !!find(handlers, function(handler) {
      return handler.fn === fn
    })
  }

  me.log = {
    all: function() { return logEntries },
    wasSent: function(addr, msg) {
      return !!find(logEntries, function(entry) {
        if (!entry.sent) return false
        if (!msg) return entry.sent.hasOwnProperty(addr)
        return deepEqual(entry.sent[addr], msg)
      })
    }
  }

  var obs = function(type, observers, address, message) {
    if (isFunction(message))
      throw new Error(
        'Second argument to "' + type + '" was a function. ' +
        'Expected message matcher.')

    observers = observers.slice(0)
    observers.push({
      address: address,
      message: message,
      type: type,
    })
    var cmd = {
      then: function(fnOrAddress, message) {
        var fn = isFunction(fnOrAddress) ? fnOrAddress :
          function() { this.send(fnOrAddress, message) }
        handlers.push({
          fn: fn,
          observers: observers
        })
        return me
      }
    }
    extendWithObserveMethods(cmd, observers)
    return cmd
  }

  var extendWithObserveMethods = function(target, observers) {
    [ 'on',
      'change',
      'next',
      'when'
    ].forEach(function(type) {
      target[type] = partial(obs, type, observers)
    })

  }

  extendWithObserveMethods(me, [])

  me.inject = function(address, message) {

    if (isHandler(me.inject.caller))
      throw new Error(
        'Illegal call to inject method from inside handler. ' +
        'Use this.send instead.')


    message = isUndefined(message) ? true : message
    // Note if this is message differs from the last one
    // sent on the same address before changing it.
    var wasChanged = !deepEqual(
      messageMap[address], message)
      messageMap[address] = message

    var matchingHandlers = handlers.filter(function(handler) {
      return !!find(handler.observers, function(observer) {
        if (observer.message && !deepEqual(observer.message, message))
          return false;
        return observer.address === address &&
               !(observer.type === 'change' && !wasChanged) &&
               !(observer.type === 'when'   && !message) &&
               observer.type !== 'peek'
      })
    })

    matchingHandlers.forEach(function(handler) {
      var receivedMap = {}
      var receivedArr = []
      pluck(handler.observers, 'address').forEach(function(address) {
        var message = messageMap[address]
        receivedMap[address] = message
        receivedArr.push(message)
      })
      var entry = {
        received: receivedMap,
        sent: null // Will be filled below by send
      }
      logEntries.push(entry)

      function send(address, message) {
        entry.sent = entry.sent || {}
        entry.sent[address] = isUndefined(message) ? true : message
        me.inject(address, message)
      }

      var commands = { send: send }

      handler.fn.apply(commands, receivedArr)

      handler.observers.forEach(function(observer) {
        if (observer.type === 'next')
          observer.type = 'peek'
      })
    })
    if (matchingHandlers.length === 0)
      logEntries.push({
        unhandled: [ address, message ]
      })
  }

  return me;
}

module.exports = createBus;