var isArray = require('mout/lang/isArray')
var pluck = require('mout/array/pluck')
var find = require('mout/array/find')
var partial = require('mout/function/partial')
var deepEqual = require('deep-equal')

var createBus = function() {
  var me = {}

  var handlers = []
  var messageMap = {}

  me.log = []

  var obs = function(type, observers, address) {
    if (!!arguments[3])
      throw new Error(
        '"'+type+'" only accepts one argument, which is address.')

    observers = observers.slice(0)
    observers.push({
      address: address,
      type: type
    })
    var me = {
      then: function(fn) {
        handlers.push({
          fn: fn,
          observers: observers
        })
      }
    }
    extendWithObserveMethods(me, observers)
    return me
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
    var isChanged = !deepEqual(messageMap[address], message)
    messageMap[address] = message
    var matchingHandlers = handlers.filter(function(handler) {
      return !!find(handler.observers, function(observer) {
        return observer.address === address &&
               !(observer.type === 'change' && !isChanged) &&
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
      me.log.push(entry)

      function send(address, message) {
        entry.sent = entry.sent || {}
        entry.sent[address] = message
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
      me.log.push({
        unhandled: [ address, message ]
      })
  }

  return me;
}

module.exports = createBus;