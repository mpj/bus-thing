var createBus = require('./bus')
var assert = require('assert')
var chai = require('chai')
var expect = chai.expect
chai.should()

// TODO: helpful error when calling like this
// bus.on('greeting', function(d,s)
// envelope is a better word than delivery
// Simple debug log messaging
// messageComparators in "on"
// pure messages as argument to "then" instead of fn

// * TODO: I've changed my mind, send is simpler than tell
// because it fits with the address/message analogy.

describe('BusThing', function() {
  var bus;
  beforeEach(function() {
    bus = createBus()
  })

  it('basic case', function(done) {
    bus.on('greeting').then(function(x) {
      assert(x, 'hello!')
      done()
    })
    bus.inject('greeting', 'hello!')
    bus.log[0].should.deep.equal({
      received: { 'greeting': 'hello!' },
      sent: null
    })
  })

  it('sends response', function() {
    bus.on('greeting').then(function(x) {
      this.tell('render', x)
    })
    bus.inject('greeting', 'hai world')
    bus.log[0].should.deep.equal({
      received: { 'greeting': 'hai world' },
      sent: { 'render': 'hai world'}
    })
    bus.log[1].should.deep.equal({
      unhandled: [ 'render', 'hai world' ]
    })

  })

  it('dual messages', function() {
    var deliveries = []
    bus
      .on('addressA')
      .on('addressB')
      .then(function(a, b) {
        deliveries.push({ a: a, b: b })
      })
    bus.inject('addressA', 'messageA')
    bus.inject('addressB', 'messageB')
    deliveries[0].should.deep.equal({
      'a': 'messageA',
      'b': undefined
    })
    deliveries[1].should.deep.equal({
      'a': 'messageA',
      'b': 'messageB'
    })
  })

  it('dual messages should be logged on first entry', function() {
    bus.on('a').then(function() {
      this.tell('b', true)
      this.tell('c', true)
    })
    bus.on('b').then(function() {
      this.tell('d')
    })
    bus.inject('a')
    bus.log[0].sent['b'].should.exist
    bus.log[0].sent['c'].should.exist
  })

  it('change', function() {
    var deliveries = []
    bus
      .change('addressA')
      .on('addressB')
      .then(function(a, b) {
        deliveries.push({a:a,b:b})
      })

    bus.inject('addressA', 'messageA1')
    bus.inject('addressA', 'messageA1') // Same, should be ignored
    bus.inject('addressB', 'messageB1')
    bus.inject('addressB', 'messageB1')
    bus.inject('addressA', 'messageA2') // Is changed, should trigger

    deliveries[1].should.deep.equal({
      'a': 'messageA1',
      'b': 'messageB1'
    })
    deliveries[3].should.deep.equal({
      'a': 'messageA2',
      'b': 'messageB1'
    })
  })

  it('change (deep equals)', function() {
    var noDeliveries = 0
    bus
      .change('buy')
      .then(function() {
        noDeliveries++
      })

    bus.inject('buy', {
      orders: [
        { price: 123.2  },
        { price: 817.21 },
      ]
    })
    bus.inject('buy', {
      orders: [
        { price: 123.2  },
        { price: 817.21 },
      ]
    })

    noDeliveries.should.equal(1)
  })


  it('next', function() {
    var greetings = []
    bus
      .next('greeting')
      .then(function(x) {greetings.push(x) })
    bus.inject('greeting', 'hello')
    bus.inject('greeting', 'hi') // <- should be ignored
    greetings.should.deep.equal([ 'hello' ])
  })

  it('when', function() {
    var deliveries = []
    bus
      .when('isReady')
      .then(function(ready) { deliveries.push(ready) })
    bus.inject('isReady', false)
    bus.inject('isReady', true)
    bus.inject('isReady', true)

    deliveries.should.deep.equal([true, true])
  })

})