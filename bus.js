var isArray = require('mout/lang/isArray')
var pluck = require('mout/array/pluck')
var find = require('mout/array/find')
var partial = require('mout/function/partial')

var createBus = function() {
  var me = {}

  var handlers = []
  var messageMap = {}

  me.log = []

  var on = function(observers, address) {
    observers = observers.slice(0)
    observers.push({
      address: address,
      type: 'on'
    })
    return {
      on: partial(on, observers),
      then: function(fn) {
        handlers.push({
          fn: fn,
          observers: observers
        })
      }
    }
  }

  me.on = function(address) {
    return on([], address)
  }

  me.tell = function(address, message) {
    messageMap[address] = message
    var matchingHandlers = handlers.filter(function(handler) {
      return !!find(handler.observers, function(observer) {
        return observer.address === address
      })
    })
    matchingHandlers.forEach(function(handler) {
      var delivery = {}
      pluck(handler.observers, 'address').forEach(function(address) {
        delivery[address] = messageMap[address]
      })
      var entry = {
        received: delivery,
        sent: null
      }
      me.log.push(entry)
      var send = function(address, message) {
        entry.sent = entry.sent || {}
        entry.sent[address] = message
        me.tell(address, message)
      }
      handler.fn(send, delivery)
    })
    if (matchingHandlers.length === 0)
      me.log.push({
        unhandled: [ address, message ]
      })
  }

  return me;
}

module.exports = createBus;