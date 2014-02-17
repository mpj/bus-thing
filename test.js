var createBus = require('./bus')
var assert = require('assert')
var chai = require('chai')
var expect = chai.expect
chai.should()


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
    bus.log.all()[0].should.deep.equal({
      received: { 'greeting': 'hello!' },
      sent: null
    })
  })

  it('sends response', function() {
    bus.on('greeting').then(function(x) {
      this.send('render', x)
    })
    bus.inject('greeting', 'hai world')
    bus.log.all()[0].should.deep.equal({
      received: { 'greeting': 'hai world' },
      sent: { 'render': 'hai world'}
    })
    bus.log.all()[1].should.deep.equal({
      unhandled: [ 'render', 'hai world' ]
    })

  })

  it('dual messages', function() {
    var sent = []
    bus
      .on('addressA')
      .on('addressB')
      .then(function(a, b) {
        sent.push({ a: a, b: b })
      })
    bus.inject('addressA', 'messageA')
    bus.inject('addressB', 'messageB')
    sent[0].should.deep.equal({
      'a': 'messageA',
      'b': undefined
    })
    sent[1].should.deep.equal({
      'a': 'messageA',
      'b': 'messageB'
    })
  })

  it('dual messages should be logged on first entry', function() {
    bus.on('a').then(function() {
      this.send('b', true)
      this.send('c', true)
    })
    bus.on('b').then(function() {
      this.send('d')
    })
    bus.inject('a')
    bus.log.all()[0].sent['b'].should.exist
    bus.log.all()[0].sent['c'].should.exist
  })

  it('change', function() {
    var sent = []
    bus
      .change('addressA')
      .on('addressB')
      .then(function(a, b) {
        sent.push({a:a,b:b})
      })

    bus.inject('addressA', 'messageA1')
    bus.inject('addressA', 'messageA1') // Same, should be ignored
    bus.inject('addressB', 'messageB1')
    bus.inject('addressB', 'messageB1')
    bus.inject('addressA', 'messageA2') // Is changed, should trigger

    sent[1].should.deep.equal({
      'a': 'messageA1',
      'b': 'messageB1'
    })
    sent[3].should.deep.equal({
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

  it('can also detect message in on', function() {
    bus.on('picky-handler', {
      arr: [
        { prop: 1 }
      ]
    }).then(function() {
      this.send('ok', true)
    })
    bus.inject('picky-handler', {
      arr: [
        { prop: 2 } // <- different
      ]
    })
    bus.log.all()[0].should.deep.equal({
      unhandled: [ 'picky-handler', {
        arr: [
          { prop: 2 } // <- different
        ]
      }]
    })
    bus.inject('picky-handler', {
      arr: [
        { prop: 1 } // <- correct
      ]
    })
    bus.log.all()[1].sent.should.deep.equal(
      { 'ok': true })
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
    var sent = []
    bus
      .when('isReady')
      .then(function(ready) { sent.push(ready) })
    bus.inject('isReady', false)
    bus.inject('isReady', true)
    bus.inject('isReady', true)

    sent.should.deep.equal([true, true])
  })

  it('throws an error when accidentally using node callbacks', function() {
    (function() {
      bus.on('greeting', function(x) {
        // this would never have been executed
      })
    }).should.throw('Second argument to "on" was a function. Expected message matcher.')
  })

  it('errors when calling bus.inject from inside transform', function() {
    (function() {
      bus.on('greeting').then(function(x) {
        bus.inject('hej')
      })
      bus.inject('greeting')
    }).should.throw(
      'Illegal call to inject method from inside handler. ' +
      'Use this.send instead.')
  })

  it('should also watch change', function() {
    (function() {
      bus.change('greeting', function(x) {
        // this would never have been executed
      })
    }).should.throw('Second argument to "change" was a function. Expected message matcher.')
  })

  it('then accepts pure envelopes', function() {
    bus.on('cook').then('oven-on', true)
    bus.inject('cook')
    bus.log.all()[1].unhandled.should.deep.equal(
      [ 'oven-on', true ])
  })

  it('wasSent (true)', function() {
    bus.on('init').then(function() {
      this.send('greeting', { txt: ['hi!'] } )
    })
    bus.log.wasSent('greeting', { txt: ['hi!'] }).should.be.false
    bus.inject('init')
    bus.log.wasSent('greeting', { txt: ['hi!'] }).should.be.true
  })

  it('wasSent (false)', function() {
    bus.on('init').then(function() {
      this.send('greeting', { txt: ['hello!'] })
    })
    bus.inject('init')
    bus.log.wasSent('greeting', { txt: ['hi!'] }).should.be.false
  })

  it('wasSent (only address)', function() {
    bus.on('init').then(function() {
      this.send('greeting', 'irrelephant')
    })
    bus.log.wasSent('greeting').should.be.false
    bus.inject('init')
    bus.log.wasSent('greeting').should.be.true
  })

  it('no message should be implicit true', function(done) {
    bus.on('generic-message').then(function(msg) {
      msg.should.be.true
      done()
    })
    bus.inject('generic-message')
  })

  it('null should count as message payload ', function(done) {
    bus.on('generic-message').then(function(msg) {
      expect(msg).to.be.null
      done()
    })
    bus.inject('generic-message', null)
  })

  it('false should count as message payload ', function(done) {
    bus.on('generic-message').then(function(msg) {
      expect(msg).to.be.false
      done()
    })
    bus.inject('generic-message', false)
  })

})