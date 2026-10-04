/**
 * OpenAJAZZ - Script de prueba rápido en Node.js
 * 
 * Este script permite validar la comunicación con el mouse y la base APEX
 * aprovechando el daemon iot_driver o inspeccionando los descriptores HID.
 */

const http = require('http');

console.log('=== OpenAJAZZ Diagnostic & Testing Tool ===');
console.log('Comprobando daemon local en 127.0.0.1:3814...');

const req = http.request({
  hostname: '127.0.0.1',
  port: 3814,
  path: '/driver.DriverGrpc/getVersion',
  method: 'POST',
  headers: {
    'content-type': 'application/grpc-web+proto',
    'x-grpc-web': '1'
  }
}, (res) => {
  console.log(`Estado HTTP del Daemon: ${res.statusCode}`);
  let data = [];
  res.on('data', chunk => data.push(chunk));
  res.on('end', () => {
    console.log('Respuesta recibida:', Buffer.concat(data).toString('hex'));
  });
});

req.on('error', (err) => {
  console.log('El daemon oficial no está corriendo actualmente en el puerto 3814.');
  console.log('OpenAJAZZ se comunicará de forma nativa mediante el backend en Rust (hidapi/IOKit en macOS).');
});

req.end();
