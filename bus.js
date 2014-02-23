var isArray = require('mout/lang/isArray')
var pluck = require('mout/array/pluck')
var find = require('mout/array/find')
var partial = require('mout/function/partial')
var deepEqual = require('deep-equal')
var isFunction = require('mout/lang/isFunction')
var isUndefined = require('mout/lang/isUndefined')
var isArguments = require('is-arguments')

// TODO: Use interpret in more places

var interpret = function() {
  var args = isArguments(arguments[0]) ? arguments[0] : arguments
  var arr = isArray(args[0]) ? args[0] : [ args[0], args[1] ]
  if (isUndefined(arr[1]))
    arr[1] = true
  return arr
}

var createBus = function() {
  var me = {}

  var observers = []
  var lastMessageMap = {}

  var logEntries = []

  function isWorker(func) {
    return !!find(observers, function(observer) {
      return observer.worker === func
    })
  }

  me.log = {
    all: function() { return logEntries },
    wasSent: function(addr, msg) {
      return !!find(logEntries, function(entry) {
        var sentEnvelopes = (entry.undelivered || []).concat(entry.delivered || [])
        return !!find(sentEnvelopes, function(envelope) {
          if (addr !== envelope[0])
            return false
          if (msg && !deepEqual(msg, envelope[1]))
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

    var matchingObservers = observers.filter(function(handler) {
      return !!find(handler.triggers, function(trigger) {

        if (trigger.address !== address)
          return false;

        if (trigger.message && !deepEqual(trigger.message, message))
          return false;

        if(trigger.type === 'change' && !wasChanged)
          return false

        // Observers of type when is only triggered when
        // sent a truthy message
        if(trigger.type === 'when'   && !message)
          return false;

        // Peek triggers only wants values if
        // a sibling trigger does.
        if(trigger.type === 'peek')
          return false;

        return true
      })
    })

    matchingObservers.forEach(function(handler) {
      var receivedEnvelopes = []
      var receivedMessages = []
      pluck(handler.triggers, 'address').forEach(function(address) {
        var message = lastMessageMap[address]
        receivedEnvelopes.push([ address, message ])
        receivedMessages.push(message)
      })
      var entry = {
        received: receivedEnvelopes
      }
      logEntries.push(entry)

      function loggingSend() {
        var envelope = interpret(arguments)
        if (send.apply(null, envelope)) {
          entry.delivered = entry.delivered || []
          entry.delivered.push(envelope)
        } else {
          entry.undelivered = entry.undelivered || []
          entry.undelivered.push(envelope)
        }
      }

      var commands = { send: loggingSend }
      handler.worker.apply(commands, receivedMessages)
      handler.triggers.forEach(function(trigger) {
        if (trigger.type === 'next')
          trigger.type = 'peek'
      })
    })

    return matchingObservers.length > 0
  }

  // Inject a message into the bus from the outside
  me.inject = function() {
    var envelope = interpret(arguments)
    // It's a common mistake to call .inject on the
    // main bus instead of this.send, catch that:
    if (isWorker(me.inject.caller))
      throw new Error(
        'Illegal call to inject method from inside handler. ' +
        'Use this.send instead.')

    var logEntry = { injected: true }
    logEntries.push(logEntry)
    logEntry[send.apply(null, envelope) ? 'delivered' : 'undelivered'] = [ envelope ]
    // Note: Even though injects are always one envelope, set as an array of one
    // to make log format consistent.


  }

  return me;
}

module.exports = createBus;