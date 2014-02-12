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
    bus.on('greeting').then(function(s,d) {
      assert(d.greeting, 'hello!')
      done()
    })
    bus.tell('greeting', 'hello!')
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

})