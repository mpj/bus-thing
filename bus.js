var isArray = require('mout/lang/isArray')
var contains = require('mout/array/contains')
var createBus = function() {
  var me = {}

  var handlers = []
  var messageMap = {}

  me.log = []

  me.on = function(addresses) {
    if (!isArray(addresses))
      addresses = [ addresses ]

    return {
      then: function(handler) {
        handlers.push({
          fn: handler,
          addresses: addresses
        })
      },
      on: function(address) {
        addresses.push(address)
        return me.on(addresses)
      }
    }
  }

  me.tell = function(address, message) {
    messageMap[address] = message
    var matchingHandlers = handlers.filter(function(handler) {
      return contains(handler.addresses, address)
    })
    matchingHandlers.forEach(function(handler) {
      var delivery = {}
      handler.addresses.forEach(function(address) {
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