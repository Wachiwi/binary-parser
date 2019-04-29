const util = require("util");
const Parser = require("../lib/binary_parser");

describe('parser injections', () => {
  test('scope injections into single parser', () => {
    let funcs = {
      custom_func: jest.fn(() => 1+1)
    }

    let parser = new Parser(funcs)

    //console.log(util.inspect(parser, false, null, true))

    parser.int8("val", {
      formatter: (val) => {
        custom_func();
        return val;
      }
    })

    expect(parser).toHaveProperty("customInjections")
    expect(parser.customInjections).toEqual(funcs)

    let buf = Buffer.from("01", "hex")
    let res = parser.parse(buf)

    expect(res).toEqual({ val: 1 })
  })

  test("scope injections into nested parser", () => {
    let funcs = {
      custom_func: jest.fn(() => 1+1)
    }

    let parser = new Parser(funcs)
      .int8("val1", {
        formatter: (val) => {
          custom_func()
          return val
        }
      })
      .int8('val2', {
        formatter: (val) => {
          custom_func()
          return val
        }
      })
      .int8('val3', {
        formatter: (val) => {
          custom_func()
          return val
        }
      })

    expect(parser).toHaveProperty("customInjections")
    expect(parser.customInjections).toEqual(funcs)

    let buf = Buffer.from("010102", "hex")
    let res = parser.parse(buf)

    expect(res).toEqual({ val1: 1, val2: 1, val3: 2 })
    expect(funcs.custom_func.mock.calls.length).toBe(3)
  })
})