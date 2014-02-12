var isArray = require('mout/lang/isArray')
var contains = require('mout/array/contains')
var createBus = function() {
  var me = {}

  var handlers = []
  var messageMap = {}

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
    handlers.forEach(function(handler) {
      var isListening = contains(handler.addresses, address)
      if(isListening) {
        var delivery = {}
        handler.addresses.forEach(function(address) {
          delivery[address] = messageMap[address]
        })
        handler.fn(null, delivery)
      }
    })
  }



  return me;
}

module.exports = createBus;