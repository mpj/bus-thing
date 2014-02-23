var isArray = require('mout/lang/isArray')
var pluck = require('mout/array/pluck')
var find = require('mout/array/find')
var partial = require('mout/function/partial')
var deepEqual = require('deep-equal')
var isFunction = require('mout/lang/isFunction')
var isUndefined = require('mout/lang/isUndefined')
var isArguments = require('is-arguments')

function envelopeFrom(args) {
  // TODO: Verify message format
  return {
    address: args[0],
    message: isUndefined(args[1]) ? true : args[1]
  }
}

var createBus = function() {
  var me = {}

  var observers      = []
  var lastMessageMap = {}
  var logEntries     = []

  function isWorker(func) {
    return !!find(observers, function(observer) {
      return observer.worker === func
    })
  }

  me.log = {
    all: function() { return logEntries },
    wasSent: function(address, message) {
      return !!find(logEntries, function(entry) {
        return !!find(entry.sent, function(delivery) {
          if (address !== delivery.envelope.address)
            return false
          if (message && !deepEqual(message, delivery.envelope.message))
            return false
          return true
        })
      })
    }
  }

  var addTrigger = function(type, triggers, address, message) {
    if (isFunction(message))
      throw new Error(
        'Second argument to "' + type + '" was a function. ' +
        'Expected message matcher. You probably meant to use .then()')

    triggers = triggers.slice(0)
    triggers.push({
      address: address,
      message: message,
      type: type,
    })
    var cmd = {
      then: function(fnOrAddress, message) {
        observers.push({
          worker: isFunction(fnOrAddress) ?
                    fnOrAddress :
                    function() { this.send(fnOrAddress, message) },
          triggers: triggers
        })
        return me
      }
    }
    extendWithAddTriggerMethods(cmd, triggers)
    return cmd
  }

  var extendWithAddTriggerMethods = function(target, triggers) {
    [ 'on',
      'change',
      'next',
      'when'
    ].forEach(function(type) {
      target[type] = partial(addTrigger, type, triggers)
    })
  }

  extendWithAddTriggerMethods(me, [])

  var send = function(sent) {

    // Make a not if this is message differs from the
    // last message sent on the same address before changing it.
    var wasChanged = !deepEqual(lastMessageMap[sent.address], sent.message)

    // Store the injected message as the new last
    // message on this address.
    lastMessageMap[sent.address] = sent.message

    var matchingObservers = observers.filter(function(handler) {
      return !!find(handler.triggers, function(trigger) {

        if (trigger.address !== sent.address)
          return false;

        if (trigger.message && !deepEqual(trigger.message, sent.message))
          return false;

        if(trigger.type === 'change' && !wasChanged)
          return false

        // Observers of type when is only triggered when
        // sent a truthy message
        if(trigger.type === 'when'   && !sent.message)
          return false;

        // Peek triggers only wants values if
        // a sibling trigger does.
        if(trigger.type === 'peek')
          return false;

        return true
      })
    })

    matchingObservers.forEach(function(handler) {

      var receivedDeliveries = handler.triggers.map(function(trigger) {
        return {
          envelope: {
            address: trigger.address,
            message: lastMessageMap[trigger.address]
          },
          trigger: trigger.type
        }
      })

      var logEntry = {
        received: receivedDeliveries,
        sender: {
          name: handler.worker.name === '' ? null : handler.worker.name
        },
        sent: []
      }
      logEntries.push(logEntry)

      function loggingSend() {
        var envelope = envelopeFrom(arguments)
        logEntry.sent.push({
          envelope: envelope,
          couldDeliver: send(envelope)
        })
      }

      function logOnly() {
        logEntry.sent.push({
          envelope: envelopeFrom(arguments),
          couldDeliver: false,
          logOnly: true
        })
      }

      var commands = {
        send: loggingSend,
        log: logOnly
      }

      handler.worker.apply(commands, receivedDeliveries.map(function(delivery) {
        return delivery.envelope.message
      }))
      handler.triggers.forEach(function(trigger) {
        if (trigger.type === 'next')
          trigger.type = 'peek'
      })
    })

    return matchingObservers.length > 0
  }

  // Inject a message into the bus from the outside
  me.inject = function() {
    var envelope = envelopeFrom(arguments)

    // It's a common mistake to call .inject on the
    // main bus instead of this.send, catch that:
    if (isWorker(me.inject.caller))
      throw new Error(
        'Illegal call to inject method from inside handler. ' +
        'Use this.send instead.')

    var logEntry = {
      sender: {
        name: 'injector'
      },
      sent: []
    }
    logEntries.push(logEntry)

    logEntry.sent.push({
      envelope: envelope,
      couldDeliver: send(envelope)
    })

  }

  return me;
}

module.exports = createBus;