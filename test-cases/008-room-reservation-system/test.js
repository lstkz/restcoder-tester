"use strict";

const helper = require("../helper");
const request = require('supertest');
const _ = require('underscore');
const Assert = helper.assert;

var api1;
var api2;
var testCount = 0;

function _sortRooms(rooms, operation, assert) {
  helper.wrap(operation, assert, () => {
    rooms.sort((a, b) => a.name.localeCompare(b.name));
    rooms.forEach((room) => {
      if (room.reservations) {
        room.reservations.sort((a, b) => a.username.localeCompare(b.username));
      }
    });
  });
}

function* _assertRoom(name, spots, spotsLeft, userMap, operation) {
  let res = yield api1.get('/rooms').end(operation);
  _sortRooms(res.body);
  const room = _.findWhere(res.body, {name});
  const reservations = [];
  _.each(userMap, (totalSpots,  username) => {
    reservations.push({username, totalSpots});
  });
  reservations.sort((a, b) => a.username.localeCompare(b.username));
  const expected = {
    name, spots, spotsLeft, reservations
  };
  Assert.deepEqual(room, expected, operation, 1);
}

module.exports = {
  before: function*() {
    api1 = request(helper.assertEnv("API_URL_0"));
    api2 = request(helper.assertEnv("API_URL_1"));
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    var res;
    res = yield api1.post('/rooms')
      .send({
        name: 'room_1',
        spots: 10
      })
      .end(++operation);
    Assert.equal(res.status, 204, operation, ++assert);
    assert = 0;
    res = yield api2.post('/rooms')
      .send({
        name: 'room_2',
        spots: 20
      })
      .end(++operation);
    Assert.equal(res.status, 204, operation, ++assert);
    assert = 0;
    res = yield api2.get('/rooms')
      .end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    _sortRooms(res.body, operation, ++assert);
    Assert.deepEqual(res.body, [
      {name: 'room_1', spots: 10, spotsLeft: 10, reservations: []},
      {name: 'room_2', spots: 20, spotsLeft: 20, reservations: []}
    ], operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    var res;
    res = yield api1.post(`/rooms/room_1/reservations`)
      .send({
        username: 'user1',
        spots: 2
      })
      .end(++operation);
    Assert.equal(res.status, 204, operation, ++assert);

    assert = 0;
    res = yield api2.post(`/rooms/room_1/reservations`)
      .send({
        username: 'user1',
        spots: 1
      })
      .end(++operation);
    Assert.equal(res.status, 204, operation, ++assert);

    assert = 0;
    res = yield api1.post(`/rooms/room_1/reservations`)
      .send({
        username: 'user2',
        spots: 4
      })
      .end(++operation);
    Assert.equal(res.status, 204, operation, ++assert);

    assert = 0;
    res = yield api2.post(`/rooms/room_2/reservations`)
      .send({
        username: 'user3',
        spots: 20
      })
      .end(++operation);
    Assert.equal(res.status, 204, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    var res;
    res = yield api2.get('/rooms')
      .end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    _sortRooms(res.body, operation, ++assert);
    Assert.deepEqual(res.body, [
      {name: 'room_1', spots: 10, spotsLeft: 3, reservations: [
        {username: 'user1', totalSpots: 3},
        {username: 'user2', totalSpots: 4},
      ]},
      {name: 'room_2', spots: 20, spotsLeft: 0, reservations: [
        {username: 'user3', totalSpots: 20},
      ]}
    ], operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    var res;
    res = yield api2.post(`/rooms/room_1/reservations`)
      .send({
        username: 'user1',
        spots: 4
      })
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
    res = yield api2.post(`/rooms/room_2/reservations`)
      .send({
        username: 'user1',
        spots: 1
      })
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    var res;
    res = yield api1.post('/rooms')
      .send({
        name: 'room_stress',
        spots: 10000
      })
      .end(++operation);
    let total = 0;
    const map = {};
    yield _.range(1, 81).map((nr) => function* () {
      total += nr;
      const api = nr % 2 ? api1 : api2;
      const username = 'user' + (nr % 4 + 1);
      if (!map[username]) {
        map[username] = 0;
      }
      map[username] += nr;
      const op = ++operation;
      res = yield api.post(`/rooms/room_stress/reservations`)
        .send({
          username,
          spots: nr
        })
        .end(op);
      Assert.equal(res.status, 204, op, 1);
    });
    yield _assertRoom('room_stress', 10000, 10000 - total, map, ++operation);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    var res;
    res = yield api1.post('/rooms')
      .send({
        name: 'room_stress2',
        spots: 60
      })
      .end(++operation);
    const map = {};
    yield _.range(1, 81).map((nr) => function* () {
      const api = nr % 2 ? api1 : api2;
      const spots = nr % 4 + 1;
      const username = 'user' + (nr % 5 + 1);
      if (!map[username]) {
        map[username] = 0;
      }
      const op = ++operation;
      res = yield api.post(`/rooms/room_stress2/reservations`)
        .send({
          username,
          spots
        })
        .end(op);
      if (res.status === 204) {
        map[username] += spots;
      } else {
        Assert.equal(res.status, 400, op, 1);
      }
    });
    yield _assertRoom('room_stress2', 60, 0, map, ++operation);
  }
};
