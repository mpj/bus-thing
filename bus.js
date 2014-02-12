var createBus = function() {
  var me = {}

  var handlers = {}

  me.on = function(address) {
    return {
      then: function(handler) {
        (handlers[address] = handlers[address] || [])
          .push(handler)
      }
    }
  }

  me.tell = function(address, message) {
    handlers[address].forEach(function(handler) {
      var delivery = {}
      delivery[address] = message
      handler(null, delivery)
    })
  }

  return me;
}

module.exports = createBus;