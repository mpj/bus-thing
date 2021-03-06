Bus Thing
=========

A message bus with logging.

```javascript
var createBus = require('bus-thing')

var bus = createBus()

bus.on('greeting').then(function(out, deliveries) {
  out('render', '<p>' + deliveries.greeting + '</p>')
})

bus.on('render').then(function(out, deliveries) {
  document.write(deliveries.render)
})

bus.tell('greeting', 'Hello!') // Writes '<p>Hello!</p>'
```

## Listen to multiple addresses
```javascript
bus
  .on('isLoading')
  .on('items')
  .then(function(out, delivery) {
    out('user-items-empty',
      !delivery.isLoading &&
       delivery.items &&
       delivery.items.length === 0)
  })

bus
  .on('user-items-empty').then(function(out, delivery) {
    console.log('Is empty:', delivery['user-items-empty'])
  })


// 'Is empty: false'
bus.tell('isLoading', true)
// 'Is empty: false'
bus.tell('items', [])
// 'Is empty: false'
bus.tell('isLoading', false)
// 'Is empty: true'


```