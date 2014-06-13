var isArray = require('mout/lang/isArray')
var isString = require('mout/lang/isString')
var pluck = require('mout/array/pluck')
var find = require('mout/array/find')
var partial = require('mout/function/partial')
var deepEqual = require('deep-equal')
var deepMatches = require('mout/object/deepMatches')
var isFunction = require('mout/lang/isFunction')
var isUndefined = require('mout/lang/isUndefined')
var isArguments = require('is-arguments')
var toArray = require('mout/lang/toArray')

function envelopeFrom(args) {
  if (!isString(args[0]))
    throw new Error('First argument was non-string. Should be address.')
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

  // type = 'log' or 'send'
  function locateSent(senderName, type, address, message) {
    var matchingDeliveries = [];
    logEntries.forEach(function(entry) {
      if (!!senderName && senderName !== entry.worker.name)
        return;

      matchingDeliveries = matchingDeliveries.concat(
        entry.deliveries.filter(function(delivery) {
          if (delivery.sent !== true)
            return false

          if (type === 'log' && !delivery.logOnly)
            return false

          if (type === 'send' && !!delivery.logOnly)
            return false

          if (!!address && address !== delivery.envelope.address)
            return false

          if (!!message &&
               !deepMatches(delivery.envelope.message, message))
            return false

          return true
        })
      )
    })
    return matchingDeliveries;
  }

  // Creates a wrapper around a function that makes it return
  // true if the wrapped function returns an array with 0
  // or more items. Arguments to the wrapping function
  // are passed through to the wrapped function.
  function oneOrMore(fn) {
    return function() {
      return fn.apply(null, toArray(arguments)).length > 0
    }
  }

  me.log = {
    all: function() { return logEntries },
    wasSent: function(address, message) {
      return me.log.worker(null).didSend(address, message)
    },
    wasLogged: function(address, message) {
      return me.log.worker(null).didLog(address, message)
    },
    lastSent: function(address) {
      var deliveriesSentOnAddress = locateSent(null, 'send', address)
      var lastDeliveryOnAddress = deliveriesSentOnAddress.pop()
      if (!lastDeliveryOnAddress) return null
      return lastDeliveryOnAddress.envelope.message
    },
    worker: function(workerName) {
      var cmd = {
        didSend: oneOrMore(partial(locateSent, workerName, 'send')),
        didLog:  oneOrMore(partial(locateSent, workerName, 'log')),
        didRun: function() {
          return !!find(logEntries, function(entry) {
            return entry.worker.name === workerName
          })
        }
      }
      return cmd
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
      'when',
      'peek'
    ].forEach(function(type) {
      target[type] = partial(addTrigger, type, triggers)
    })
  }

  extendWithAddTriggerMethods(me, [])

  var send = function(sent) {

    // Make a note if this is message differs from the
    // last message sent on the same address before changing it.
    var wasChanged = !deepEqual(lastMessageMap[sent.address], sent.message)

    // Store the injected message as the new last
    // message on this address.
    lastMessageMap[sent.address] = sent.message

    var matchingObservers = observers.filter(function(handler) {
      return !!find(handler.triggers, function(trigger) {

        if (trigger.address !== sent.address)
          return false;

        if (trigger.message && !deepMatches(trigger.message, sent.message))
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
          received: true,
          trigger: trigger.type,
          envelope: {
            address: trigger.address,
            message: lastMessageMap[trigger.address]
          }
        }
      })

      var logEntry = {
        deliveries: receivedDeliveries,
        worker: {
          name: handler.worker.name === '' ? null : handler.worker.name
        }
      }
      logEntries.push(logEntry)

      function loggingSend() {
        var envelope = envelopeFrom(arguments)
        logEntry.deliveries.push({
          sent: true,
          envelope: envelope,
          couldDeliver: send(envelope)
        })
      }

      function logOnly() {
        logEntry.deliveries.push({
          sent: true,
          logOnly: true,
          envelope: envelopeFrom(arguments),
          couldDeliver: false
        })
      }

      var commands = {
        send: loggingSend,
        log: logOnly
      }

      var workerArgs = receivedDeliveries.map(function(delivery) {
        return delivery.envelope.message
      })
      var returnValue = handler.worker.apply(commands, workerArgs)
      if (!isUndefined(returnValue))
        throw new Error('Worker returned a value. Use this.send instead.')

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
      worker: {
        name: 'injector'
      },
      deliveries: []
    }
    logEntries.push(logEntry)

    logEntry.deliveries.push({
      sent: true,
      envelope: envelope,
      couldDeliver: send(envelope)
    })

    return me

  }

  return me;
}

module.exports = createBus;