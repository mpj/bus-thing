var createBus = require('./bus')
var assert = require('assert')
var chai = require('chai')
var expect = chai.expect
chai.should()


// TODO: Way too messy test suite, needs cleanup
//
// TODO: Error on more than one argument to given (passing list instead of args)
//       ... or perhaps make this allowed behavior?
//
//
// TODO: Pretty sure that .next has a bug - I think it can be restored
// to a 'peek' prematurely if it's part of an observer that is triggerd
// when another message is changed.

// TODO: Wild / pure workers
// TODO: Disallow functions and regexp in as messages


// TODO: Throw an error if a worker returns something, to prevent
// accidental returns over sends.

// TODO: Unhandled exceptions

// TODO: Circular references. See
// http://knockoutjs.com/documentation/computedObservables.html
//
// THOUGHT: Make log a bit less public, and encourage use of the
// helper functions


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
      worker: {
        name: 'injector'
      },
      deliveries: [
        {
          envelope: {
            address: 'greeting',
            message: 'hello!'
          },
          sent: true,
          couldDeliver: true
        }
      ]
    })
    bus.log.all()[1].should.deep.equal({
      deliveries: [{
        envelope: {
          address: 'greeting',
          message: 'hello!'
        },
        received: true,
        trigger: 'on'
      }],
      worker: {
        name: null
      }
    })
    bus.log.wasLogged('greeting','hello!').should.be.false
  })

  it('sends response', function() {
    bus.on('greeting').then(function(x) {
      this.send('render', x)
    })
    bus.inject('greeting', 'hai world')
    bus.log.all()[1].should.deep.equal({
      deliveries: [
        {
          received: true,
          trigger: 'on',
          envelope: {
            address: 'greeting',
            message: 'hai world'
          }
        },{
          sent: true,
          envelope: {
            address: 'render',
            message: 'hai world'
          },
          couldDeliver: false
        }
      ],
      worker: {
        name: null
      }
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
    bus.log.all()[1].deliveries.should.deep.equal([
      {
        received: true,
        trigger: 'on',
        envelope: {
          address: "a",
          message: true
        }
      },{
        sent: true,
        envelope: {
          address: 'b',
          message: true
        },
        couldDeliver: true
      },
      {
        sent: true,
        envelope: {
          address: 'c',
          message: true
        },
        couldDeliver: false
      },
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
    .inject('addressA', 'messageA1') // Same, should be ignored
    .inject('addressB', 'messageB1')
    .inject('addressB', 'messageB1')
    .inject('addressA', 'messageA2') // Is changed, should trigger

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
      worker: {
        name: 'injector'
      },
      deliveries: [
        {
          sent: true,
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
    bus.log.all()[2].deliveries[1].should.deep.equal({
      sent: true,
      envelope: {
        address: 'ok',
        message: true
      },
      couldDeliver: false
    })
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

  it('peek', function() {
    var arr = []
    bus
      .on('a')
      .peek('b')
      .then(function(a, b) {
        arr.push(b)
      })

    bus.inject('b', 2)
    arr.length.should.equal(0)
    bus.inject('a', 1)
    arr.length.should.equal(1)
    arr[0].should.equal(2)

  })

  it('throws an error when accidentally using node callbacks', function() {
    (function() {
      bus.on('greeting', function(x) {
        // this would never have been executed
      })
    }).should.throw('Second argument to "on" was a function. Expected message matcher. You probably meant to use .then()')
  })

  it('throws an error if passing something other than a string as address', function(done) {
    bus.on('greeting').then(function(x) {
      var me = this;
      (function() {
        me.send(123)
      }).should.throw(
        'First argument was non-string. Should be address.')
      done()
    }).inject('greeting')
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
    bus.log.all()[1].deliveries[1].should.deep.equal({
      sent: true,
      envelope: {
        address: 'oven-on',
        message: true
      },
      couldDeliver: false
    })
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
    bus.log.all()[0].deliveries[0].should.deep.equal({
      sent: true,
      envelope: {
        address: 'start',
        message: true
      },
      couldDeliver: true
    })
    bus.log.all()[1].deliveries[1].should.deep.equal({
      sent: true,
      envelope: {
        address: 'hai',
        message: true
      },
      couldDeliver: false
    })

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
    bus.log.all()[0].deliveries[0].should.deep.equal({
      sent: true,
      envelope: {
        address: 'start',
        message: null
      },
      couldDeliver: true
    })

    bus.log.all()[1].deliveries[1].should.deep.equal({
      sent: true,
      envelope: {
        address: 'hai',
        message: null
      },
      couldDeliver: false
    })

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
    bus.log.all()[1].deliveries[1].should.deep.equal({
      sent: true,
      couldDeliver: false,
      envelope: {
        address: 'b',
        message: true
      }
    })
  })

  it('logs function name as worker name', function() {
    bus.on('start').then(function startHandler() {
      this.send('bam!')
    })
    bus.inject('start')
    bus.log.all()[1].worker.name.should.equal('startHandler')

    // TODO: Piggybacking on this test, needs cleanup
    bus.log.worker('startHandler').didLog('bam!')
      .should.be.false
  })

  it('using logging does NOT trigger handlers', function(){
    var triggers = 0
    bus.on('a').then(function() {
      triggers++
      this.log('a')
    })
    bus.inject('a', true)

    triggers.should.equal(1)

    bus.log.all()[1].deliveries[1].should.deep.equal({
      sent: true,
      logOnly: true,
      envelope: {
        address: 'a',
        message: true
      },
      couldDeliver: false
    })
  })

  describe('when aaron sends property object to b on a', function() {
    beforeEach(function() {
      bus
        .on('a')
        .then(function aaron() {
          this.send('b', { myProp: 'myVal' })
        })
        .inject('a')
    })

    describe('log worker helper will say that', function() {

      it('it did', function() {
        bus.log
          .worker('aaron')
          .didSend('b')
          .should.be.true
      })

      it('it did send the message that it did', function() {
        bus.log
          .worker('aaron')
          .didSend('b', { myProp: 'myVal' })
          .should.be.true
      })

      it('it did send in general', function() {
        bus.log
          .worker('aaron')
          .didSend()
          .should.be.true
      })

      it('it did NOT if one property differs', function() {
        bus.log
          .worker('aaron')
          .didSend('b', { myProp: 'otherVal' })
          .should.be.false
      })

      it('it did NOT send a completely different delivery', function() {
        bus.log
          .worker('aaron')
          .didSend('c')
          .should.be.false
      })

      it('another worker did NOT send that message', function() {
        bus.log
          .worker('wayne')
          .didSend({ myProp: 'otherVal' })
          .should.be.false
      })

      it('another worker did NOT send in general', function() {
        bus.log
          .worker('wayne')
          .didSend()
          .should.be.false
      })

      it('the injector did send its message', function() {
        bus.log
          .worker('injector')
          .didSend('a')
          .should.be.true
      })

    })
  })

  describe('if a worker only logs a delivery', function() {
    beforeEach(function() {
      bus
       .on('say')
       .then(function eavesDropper(x) {
         this.log('someone-said', x)
       })
       .inject('say','hello!!')
    })

    it('didLog was true', function() {
      bus.log
        .worker('eavesDropper')
        .didLog('someone-said', 'hello!!')

        .should.be.true
    })

    it('wasLogged is true', function() {
      bus.log
        .wasLogged('someone-said', 'hello!!')
        .should.be.true
    })

    it('wasSent is false', function() {
      bus.log
        .wasSent('someone-said', 'hello!!')
        .should.be.false
    })

  })

  describe('when we send twice to an address', function() {
    beforeEach(function() {
      bus.on('a').then(function() {
        this.send('b', 3)
        this.send('b', 4)
      }).inject('a')
    })

    it('lastSent should equal the second value', function() {
      bus.log.lastSent('b').should.equal(4)
    })

    it('lastSent should be null on other addresses', function() {
      expect(bus.log.lastSent('c')).to.be.null
    })
  })


})

function dbg(bus) {
  console.log('')
  console.log('--- DEBUG ---')
  console.log(JSON.stringify(bus.log.all(), null, 2))
}