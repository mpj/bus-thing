var createBus = require('./bus')
var assert = require('assert')

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

})