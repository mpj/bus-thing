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
  var lastMessageMap = {}

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
        return !!find(entry.sent, function(envelope) {
          if (addr !== envelope[0])
            return false
          if (msg && !deepEqual(msg, envelope[1]))
            return false
          return true
        })
      })
    }
  }

  var obs = function(type, observers, address, message) {
    if (isFunction(message))
      throw new Error(
        'Second argument to "' + type + '" was a function. ' +
        'Expected message matcher. You probably meant to use .then()')

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

  var send = function(address, message) {

    // Translate any undefined message to true,
    // but not null or other falsy values
    message = isUndefined(message) ? true : message

    // Make a not if this is message differs from the
    // last message sent on the same address before changing it.
    var wasChanged = !deepEqual(lastMessageMap[address], message)

    // Store the injected message as the new last
    // message on this address.
    lastMessageMap[address] = message

    // TODO: Clearer observer/handler semantics
    var matchingHandlers = handlers.filter(function(handler) {
      return !!find(handler.observers, function(observer) {

        if (observer.address !== address)
          return false;

        if (observer.message && !deepEqual(observer.message, message))
          return false;

        if(observer.type === 'change' && !wasChanged)
          return false

        // Observers of type when is only triggered when
        // sent a truthy message
        if(observer.type === 'when'   && !message)
          return false;

        // Peek observers only wants values if
        // a sibling observer does.
        if(observer.type === 'peek')
          return false;

        return true
      })
    })

    matchingHandlers.forEach(function(handler) {
      var receivedMap = {}
      var receivedArr = []
      pluck(handler.observers, 'address').forEach(function(address) {
        var message = lastMessageMap[address]
        receivedMap[address] = message
        receivedArr.push(message)
      })
      var entry = {
        received: receivedMap,
        sent: [] // Will be filled below by send
      }
      logEntries.push(entry)

      function loggingSend(address, message) {
        entry.sent.push(send(address, message))
      }

      var commands = { send: loggingSend }

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

    return [address, message]
  }

  // Inject a message into the bus from the outside
  me.inject = function(address, message) {
    // It's a common mistake to call .inject on the
    // main bus instead of this.send, catch that:
    if (isHandler(me.inject.caller))
      throw new Error(
        'Illegal call to inject method from inside handler. ' +
        'Use this.send instead.')

    message = isUndefined(message) ? true : message
    logEntries.push({
      injected: [ address, message ]
    })
    send(address, message)

  }

  return me;
}

module.exports = createBus;