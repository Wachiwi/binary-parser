let util = require("util")
let Parser = require("../lib/binary_parser")

describe("Primitive parser", () => {
  describe("Primitive parsers", () => {
    it("should nothing", () => {
      let parser = Parser.start()
      let buffer = Buffer.from([0xa, 0x14, 0x1e, 0x28, 0x32])
      expect(parser.parse(buffer)).toEqual({})
    })

    it("should parse integer types", () => {
      let parser = Parser.start()
        .uint8("a")
        .int16le("b")
        .uint32be("c")

      let buffer = Buffer.from([0x00, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e])
      expect(parser.parse(buffer)).toEqual({ a: 0, b: 1234, c: 12345678 })
    })

    it("should use formatter to transform parsed integer", () => {
      let parser = Parser.start()
        .uint8("a", {
          formatter: (val) => {
            return val * 2
          }
        })
        .int16le("b", {
          formatter: (val) => {
            return "test" + String(val)
          }
        })

      let buffer = Buffer.from([0x01, 0xd2, 0x04])
      expect(parser.parse(buffer)).toEqual({ a: 2, b: "test1234" })
    })
    it("should parse floating point types", () => {
      let parser = Parser.start()
        .floatbe("a")
        .doublele("b")

      let FLT_EPSILON = 0.00001
      let buffer = Buffer.from([
        0x41,
        0x45,
        0x85,
        0x1f,
        0x7a,
        0x36,
        0xab,
        0x3e,
        0x57,
        0x5b,
        0xb1,
        0xbf
      ])
      let result = parser.parse(buffer)

      expect(Math.abs(result.a - 12.345)).toBeLessThan(FLT_EPSILON)
      expect(Math.abs(result.b - -0.0678)).toBeLessThan(FLT_EPSILON)
    })

    it("should handle endianess", () => {
      let parser = Parser.start()
        .int32le("little")
        .int32be("big")

      let buffer = Buffer.from([
        0x4e,
        0x61,
        0xbc,
        0x00,
        0x00,
        0xbc,
        0x61,
        0x4e
      ])

      expect(parser.parse(buffer)).toEqual({
        little: 12345678,
        big: 12345678
      })
    })

    it("should skip when specified", () => {
      let parser = Parser.start()
        .uint8("a")
        .skip(3)
        .uint16le("b")
        .uint32be("c")

      let buffer = Buffer.from([
        0x00,
        0xff,
        0xff,
        0xfe,
        0xd2,
        0x04,
        0x00,
        0xbc,
        0x61,
        0x4e
      ])

      expect(parser.parse(buffer)).toEqual({ a: 0, b: 1234, c: 12345678 })
    })
  })

  describe("Bit field parsers", () => {
    let binaryLiteral = (s) => {
      let bytes = []

      s = s.replace(/\s/g, "")
      for (let i = 0; i < s.length; i += 8) {
        bytes.push(parseInt(s.slice(i, i + 8), 2))
      }

      return Buffer.from(bytes)
    }

    it("binary literal helper should work", () => {
      expect(binaryLiteral("11110000")).toEqual(Buffer.from([0xf0]))
      expect(
        binaryLiteral("11110000 10100101")).toEqual(
        Buffer.from([0xf0, 0xa5])
      )
    })

    it("should parse 1-byte-length bit field sequence", () => {
      let parser = new Parser()
        .bit1("a")
        .bit2("b")
        .bit4("c")
        .bit1("d")

      let buf = binaryLiteral("1 10 1010 0")
      expect(parser.parse(buf)).toEqual({
        a: 1,
        b: 2,
        c: 10,
        d: 0
      })

      parser = new Parser()
        .endianess("little")
        .bit1("a")
        .bit2("b")
        .bit4("c")
        .bit1("d")

      expect(parser.parse(buf)).toEqual({
        a: 0,
        b: 2,
        c: 10,
        d: 1
      })
    })

    it("should parse 2-byte-length bit field sequence", () => {
      let parser = new Parser()
        .bit3("a")
        .bit9("b")
        .bit4("c")

      let buf = binaryLiteral("101 111000111 0111")
      expect(parser.parse(buf)).toEqual({
        a: 5,
        b: 455,
        c: 7
      })

      parser = new Parser()
        .endianess("little")
        .bit3("a")
        .bit9("b")
        .bit4("c")

      expect(parser.parse(buf)).toEqual({
        a: 7,
        b: 398,
        c: 11
      })
    })

    it("should parse 4-byte-length bit field sequence", () => {
      let parser = new Parser()
        .bit1("a")
        .bit24("b")
        .bit4("c")
        .bit2("d")
        .bit1("e")

      let buf = binaryLiteral("1 101010101010101010101010 1111 01 1")
      expect(parser.parse(buf)).toEqual({
        a: 1,
        b: 11184810,
        c: 15,
        d: 1,
        e: 1
      })

      parser = new Parser()
        .endianess("little")
        .bit1("a")
        .bit24("b")
        .bit4("c")
        .bit2("d")
        .bit1("e")

      expect(parser.parse(buf)).toEqual({
        a: 1,
        b: 11184829,
        c: 10,
        d: 2,
        e: 1
      })
    })

    it("should parse nested bit fields", () => {
      let parser = new Parser().bit1("a").nest("x", {
        type: new Parser()
          .bit2("b")
          .bit4("c")
          .bit1("d")
      })

      let buf = binaryLiteral("11010100")

      expect(parser.parse(buf)).toEqual({
        a: 1,
        x: {
          b: 2,
          c: 10,
          d: 0
        }
      })
    })
  })

  describe("String parser", () => {
    it("should parse ASCII encoded string", () => {
      let text = "hello, world"
      let buffer = Buffer.from(text, "ascii")
      let parser = Parser.start().string("msg", {
        length: buffer.length,
        encoding: "ascii"
      })

      expect(parser.parse(buffer).msg).toEqual(text)
    })

    it("should parse UTF8 encoded string", () => {
      let text = "こんにちは、せかい。"
      let buffer = Buffer.from(text, "utf8")
      let parser = Parser.start().string("msg", {
        length: buffer.length,
        encoding: "utf8"
      })

      expect(parser.parse(buffer).msg).toEqual(text)
    })

    it("should parse HEX encoded string", () => {
      let text = "cafebabe"
      let buffer = Buffer.from(text, "hex")
      let parser = Parser.start().string("msg", {
        length: buffer.length,
        encoding: "hex"
      })

      expect(parser.parse(buffer).msg).toEqual(text)
    })

    it("should parse variable length string", () => {
      let buffer = Buffer.from("0c68656c6c6f2c20776f726c64", "hex")
      let parser = Parser.start()
        .uint8("length")
        .string("msg", { length: "length", encoding: "utf8" })

      expect(parser.parse(buffer).msg).toEqual("hello, world")
    })

    it("should parse zero terminated string", () => {
      let buffer = Buffer.from("68656c6c6f2c20776f726c6400", "hex")
      let parser = Parser.start().string("msg", {
        zeroTerminated: true,
        encoding: "ascii"
      })

      expect(parser.parse(buffer)).toEqual({ msg: "hello, world" })
    })

    it("should parser zero terminated fixed-length string", () => {
      let buffer = Buffer.from("abc\u0000defghij\u0000")
      let parser = Parser.start()
        .string("a", { length: 5, zeroTerminated: true })
        .string("b", { length: 5, zeroTerminated: true })
        .string("c", { length: 5, zeroTerminated: true })

      expect(parser.parse(buffer)).toEqual({
        a: "abc",
        b: "defgh",
        c: "ij"
      })
    })

    it("should strip trailing null characters", () => {
      let buffer = Buffer.from("746573740000", "hex")
      let parser1 = Parser.start().string("str", {
        length: 7,
        stripNull: false
      })

      let parser2 = Parser.start().string("str", {
        length: 7,
        stripNull: true
      })

      expect(parser1.parse(buffer).str).toEqual("test\u0000\u0000")
      expect(parser2.parse(buffer).str).toEqual("test")
    })

    it("should parse string greedily with zero-bytes internally", () => {
      let buffer = Buffer.from("abc\u0000defghij\u0000")
      let parser = Parser.start().string("a", { greedy: true })

      expect(parser.parse(buffer)).toEqual({
        a: "abc\u0000defghij\u0000"
      })
    })
  })

  describe("Buffer parser", () => {
    it("should parse as buffer", () => {
      let parser = new Parser().uint8("len").buffer("raw", {
        length: "len"
      })

      let buf = Buffer.from("deadbeefdeadbeef", "hex")
      let result = parser.parse(Buffer.concat([Buffer.from([8]), buf]))

      expect(result.raw).toEqual(buf)
    })

    it("should clone buffer if options.clone is true", () => {
      let parser = new Parser().buffer("raw", {
        length: 8,
        clone: true
      })

      let buf = Buffer.from("deadbeefdeadbeef", "hex")
      let result = parser.parse(buf)
      expect(result.raw).toEqual(buf)
      result.raw[0] = 0xff
      expect(result.raw).not.toEqual(buf)
    })
  })
})
