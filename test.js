var createBus = require('./bus')
var assert = require('assert')
var chai = require('chai')
var expect = chai.expect
chai.should()

// TODO: Pure log functionality - will never be passed to worker,
// used mainly to support expect failures and Ok
// TODO: Warn if on never had a then

// IDEA: Not liking how the injector entries behave now,
// but note sure how to make them better.

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
      sender: {
        name: 'injector'
      },
      sent: [
        {
          envelope: {
            address: 'greeting',
            message: 'hello!'
          },
          couldDeliver: true
        }
      ]
    })
    bus.log.all()[1].should.deep.equal({
      received: [{
        envelope: {
          address: 'greeting',
          message: 'hello!'
        },
        trigger: 'on'
      }],
      sender: {
        name: null
      },
      sent: []
    })
  })

  it('sends response', function() {
    bus.on('greeting').then(function(x) {
      this.send('render', x)
    })
    bus.inject('greeting', 'hai world')
    bus.log.all()[1].should.deep.equal({
      received: [
        {
          envelope: {
            address: 'greeting',
            message: 'hai world'
          },
          trigger: 'on'
        }
      ],
      sender: {
        name: null
      },
      sent: [
        {
          envelope: {
            address: 'render',
            message: 'hai world'
          },
          couldDeliver: false
        }
      ]
    })
    bus.log.all().length.should.equal(2)

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
    bus
      .on('a').then(function() {
        this.send('b', true)
        this.send('c', true)
      })
      .on('b').then(function() {
        this.send('d')
      })
    bus.inject('a')
    bus.log.all()[1].sent.should.deep.equal([
      {
        envelope: {
          address: 'b',
          message: true
        },
        couldDeliver: true
      },
      {
        envelope: {
          address: 'c',
          message: true
        },
        couldDeliver: false
      }
    ])
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
      sender: {
        name: 'injector'
      },
      sent: [
        {
          envelope: {
            address: 'picky-handler',
            message: {
              arr: [
                { prop: 2 } // <- different
              ]
            }
          },
          couldDeliver: false
        }
      ]
    })
    bus.inject('picky-handler', {
      arr: [
        { prop: 1 } // <- correct
      ]
    })
    bus.log.all()[2].sent.should.deep.equal([
      {
        envelope: {
          address: 'ok',
          message: true
        },
        couldDeliver: false
      }
    ])
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
    }).should.throw('Second argument to "on" was a function. Expected message matcher. You probably meant to use .then()')
  })

  it('errors when calling bus.inject from inside transform', function() {
    (function() {
      bus
        .on('greeting').then(function(x) {
          bus.inject('hej')
        })
        .inject('greeting')
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
    bus.log.all()[1].sent.should.deep.equal([{
      envelope: {
        address: 'oven-on',
        message: true
      },
      couldDeliver: false
    }])
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

  it('undefined message should be implicit true (callback)', function(done) {
    bus.on('generic-message').then(function(msg) {
      msg.should.be.true
      done()
    })
    bus.inject('generic-message')
  })

  it('undefined message should be implicit true (log)', function(done) {
    bus.on('start').then(function(msg) {
      this.send('hai')
      done()
    })
    bus.inject('start')
    bus.log.all()[0].sent.should.deep.equal([{
      envelope: {
        address: 'start',
        message: true
      },
      couldDeliver: true
    }])
    bus.log.all()[1].sent.should.deep.equal([{
      envelope: {
        address: 'hai',
        message: true
      },
      couldDeliver: false
    }])

  })

  it('null should count as message payload', function(done) {
    bus.on('generic-message').then(function(msg) {
      expect(msg).to.be.null
      done()
    })
    bus.inject('generic-message', null)
  })

  it('null should count as message payload (log)', function(done) {
    bus.on('start').then(function(msg) {
      this.send('hai', null)
      done()
    })
    bus.inject('start', null)
    bus.log.all()[0].sent.should.deep.equal([{
      envelope: {
        address: 'start',
        message: null
      },
      couldDeliver: true
    }])

    bus.log.all()[1].sent.should.deep.equal([{
      envelope: {
        address: 'hai',
        message: null
      },
      couldDeliver: false
    }])

  })

  it('false should count as message payload ', function(done) {
    bus.on('generic-message').then(function(msg) {
      expect(msg).to.be.false
      done()
    })
    bus.inject('generic-message', false)
  })

  it('unhandled should show interpretation', function() {
    bus.on('a').then(function() { this.send('b') })
    bus.inject('a')
    bus.log.all()[1].sent.should.deep.equal([{
      couldDeliver: false,
      envelope: {
        address: 'b',
        message: true
      }
    }])
  })

  it('logs function name as worker', function() {
    bus.on('start').then(function startHandler() {
      this.send('bam!')
    })
    bus.inject('start')
    bus.log.all()[1].sender.name.should.equal('startHandler')
  })
})

function dbg(bus) {
  console.log('')
  console.log('--- DEBUG ---')
  console.log(JSON.stringify(bus.log.all(), null, 2))
}