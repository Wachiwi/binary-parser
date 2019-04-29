const util = require('util');
const Parser = require('../lib/binary_parser');

describe('bit operations', () => {
  test('skip bits at the beginning', () => {
    let parser = new Parser()
      .int8('a')
      .skipBit(4)
      .bit4('b')
    let buffer = Buffer.from('0123', 'hex')

    expect(parser.parse(buffer)).toEqual({
      a: 1,
      b: 3
    })
  })

  test('skip bits in the middle', () => {
    let parser = new Parser()
      .int8('a')
      .bit3('b')
      .skipBit(2)
      .bit3('c')
    let buffer = Buffer.from('0123', 'hex')

    expect(parser.parse(buffer)).toEqual({
      a: 1,
      b: 1,
      c: 3
    })
  })

  test('skip bits at the end', () => {
    let parser = new Parser()
      .int8('a')
      .bit4('b')
      .skipBit(4)
    let buffer = Buffer.from('0123', 'hex')

    expect(parser.parse(buffer)).toEqual({
      a: 1,
      b: 2
    })
  })

  test('skip multiple times', () => {
    let parser = new Parser()
      .bit4('a')
      .skipBit(4)
      .bit4('b')
      .skipBit(4)
    let buffer = Buffer.from('0123', 'hex')

    expect(parser.parse(buffer)).toEqual({
      a: 0,
      b: 2
    })
  })

  test('skip after each other', () => {
    let parser = new Parser()
      .int8('a')
      .skipBit(4)
      .skipBit(4)
    let buffer = Buffer.from('0123', 'hex')

    expect(parser.parse(buffer)).toEqual({
      a: 1
    })
  })
})