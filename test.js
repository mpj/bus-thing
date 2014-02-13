var createBus = require('./bus')
var assert = require('assert')
var chai = require('chai')
var expect = chai.expect
chai.should()

// TODO: more advanced messages change detection
// TODO: ok, coffeescript would be a LOT nicer
// TODO: when

describe('BusThing', function() {
  var bus;
  beforeEach(function() {
    bus = createBus()
  })

  it('basic case', function(done) {
    bus.on('greeting').then(function(s,d) {
      assert(d.greeting, 'hello!')
      done()
    })
    bus.tell('greeting', 'hello!')
    bus.log[0].should.deep.equal({
      received: { 'greeting': 'hello!' },
      sent: null
    })
  })

  it('sends response', function() {
    bus.on('greeting').then(function(s, d) {
      s('render', d.greeting)
    })
    bus.tell('greeting', 'hai world')
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
      .then(function(s,d) {
        deliveries.push(d)
      })
    bus.tell('addressA', 'messageA')
    bus.tell('addressB', 'messageB')
    deliveries[0].should.deep.equal({
      'addressA': 'messageA',
      'addressB': undefined
    })
    deliveries[1].should.deep.equal({
      'addressA': 'messageA',
      'addressB': 'messageB'
    })

  })

  it('change', function() {
    var deliveries = []
    bus
      .change('addressA')
      .on('addressB')
      .then(function(s,d) {
        deliveries.push(d)
      })

    bus.tell('addressA', 'messageA1')
    bus.tell('addressA', 'messageA1') // Same, should be ignored
    bus.tell('addressB', 'messageB1')
    bus.tell('addressB', 'messageB1')
    bus.tell('addressA', 'messageA2') // Is changed, should trigger

    deliveries[1].should.deep.equal({
      'addressA': 'messageA1',
      'addressB': 'messageB1'
    })
    deliveries[3].should.deep.equal({
      'addressA': 'messageA2',
      'addressB': 'messageB1'
    })
  })

  it('next', function() {
    var deliveries = []
    bus
      .next('greeting')
      .then(function(s,d) { deliveries.push(d) })
    bus.tell('greeting', 'hello')
    bus.tell('greeting', 'hi')
    deliveries.should.deep.equal([{
      'greeting': 'hello'
    }])
  })

  it('when', function() {
    var deliveries = []
    bus
      .when('isReady')
      .then(function(s, d) { deliveries.push(d) })
    bus.tell('isReady', false)
    bus.tell('isReady', true)
    bus.tell('isReady', true)

    deliveries.should.deep.equal([
      { 'isReady': true },
      { 'isReady': true }
    ])
  })

})