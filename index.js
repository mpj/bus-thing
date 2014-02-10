var createBus = function() {
  var me = {}

  var _handlers = {}
  var _events = []

  me.space = function(name) {
    return {
      on: function(address) {
        return {
          then: function(transform) {
            _handlers[address] = _handlers[address] || []
            _handlers[address].push(transform)
          }
        }
      }
    }
  }
  me.send = function(receivedAddress, receivedMessage) {
    var deliveries = {}
    deliveries[receivedAddress] = receivedMessage

    if(!_handlers[receivedAddress]) {
      _events.push({
        unhandled: [receivedAddress, receivedMessage]
      })
      return;
    }
    _handlers[receivedAddress].forEach(function(handler) {
      var event = {}
      event.received = [receivedAddress, receivedMessage]
      _events.push(event)

      var sender = function(sendAddress, sendMessage) {
        event.sent     = [sendAddress, sendMessage]
        me.send          (sendAddress, sendMessage)
      }
      handler(sender, deliveries)
    })
  }
  me.all = function() {
    return _events;
  }
  return me
}


var run = function(spec) {
  var bus = spec.go()

  var wasOk = false
  bus.all().forEach(function(event) {
    if (event.unhandled && event.unhandled[0] === 'expectation-ok') {
      wasOk = true
    }

  })
  if (wasOk)
    console.log("OK:", spec.name)
  else
    console.warn("FAIL:", spec.name)

}

var spec = function(bus, name) {
  return {
    when: function(whenAddress, whenMessage) {
      return {
        willSend: function(willSendAddress, willSendMessage) {
          bus.space().on(willSendAddress).then(function(s,d) {
            if (d[willSendAddress] === willSendMessage)
              s('expectation-ok', name)
          })
          return {
            name: name,
            go: function() {
              bus.send(whenAddress, whenMessage)
              return bus
            }
          }
        }
      }
    }
  }
}


var bus = createBus()

bus
  .space('app')
  .on('start')
  .then(function(s, d) {
    s('greeting', 'hello')
  })





run(spec(bus, 'it sends start')
  .when('start')
    .willSend('greeting', 'hello'))



