const dgram = require('dgram');
const client = dgram.createSocket('udp4');

const buffer = Buffer.alloc(324);

// IsRaceOn = 1
buffer.writeInt32LE(1, 0);
// EngineMaxRpm = 8000
buffer.writeFloatLE(8000, 8);
// CurrentEngineRpm = 4500
buffer.writeFloatLE(4500, 16);

// NO Position, NO Velocity, NO Boost (they will be 0 in the buffer)

// Speed = 30 m/s (108 km/h)
buffer.writeFloatLE(30, 256);

client.send(buffer, 5607, 'localhost', (err) => {
  if (err) console.error(err);
  else console.log('Packet FH6 PARTIEL simulé envoyé à localhost:5607');
  client.close();
});
