const dgram = require('dgram');
const client = dgram.createSocket('udp4');

const buffer = Buffer.alloc(324);

// IsRaceOn = 1
buffer.writeInt32LE(1, 0);
// EngineMaxRpm = 8000
buffer.writeFloatLE(8000, 8);
// CurrentEngineRpm = 4500
buffer.writeFloatLE(4500, 16);
// Acceleration X = 1.0 (Lateral)
buffer.writeFloatLE(1.0, 20);
// Acceleration Z = 2.0 (Longitudinal)
buffer.writeFloatLE(2.0, 28);

// CarClass = 4 (S1)
buffer.writeInt32LE(4, 216);
// CarPI = 850
buffer.writeInt32LE(850, 220);

// Speed = 30 m/s (108 km/h)
buffer.writeFloatLE(30, 256);
// Power = 300000 Watts (~402 HP)
buffer.writeFloatLE(300000, 260);

// Fuel = 0.75
buffer.writeFloatLE(0.75, 288);
// Distance = 1000m
buffer.writeFloatLE(1000, 292);

// LapNumber = 3
buffer.writeUInt16LE(3, 312);
// RacePosition = 5
buffer.writeUInt8(5, 314);

// Accel = 255
buffer.writeUInt8(255, 315);
// Gear = 4 (3rd gear)
buffer.writeUInt8(4, 319);

client.send(buffer, 5607, 'localhost', (err) => {
  if (err) console.error(err);
  else console.log('Packet FH6 simulé envoyé à localhost:5607');
  client.close();
});
