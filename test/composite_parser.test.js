const util = require("util")
const Parser = require("../lib/binary_parser")

describe("Composite parser", () => {
  describe("Array parser", () => {
    it("should parse array of primitive types", () => {
      let parser = Parser.start()
        .uint8("length")
        .array("message", {
          length: "length",
          type: "uint8"
        })

      let buffer = Buffer.from([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
      expect(parser.parse(buffer)).toEqual({
        length: 12,
        message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      })
    })

    it("should parse array of primitive types with lengthInBytes", () => {
      let parser = Parser.start()
        .uint8("length")
        .array("message", {
          lengthInBytes: "length",
          type: "uint8"
        })

      let buffer = Buffer.from([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
      expect(parser.parse(buffer)).toEqual({
        length: 12,
        message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      })
    })

    it("should parse array of user defined types", () => {
      let elementParser = new Parser().uint8("key").int16le("value")

      let parser = Parser.start()
        .uint16le("length")
        .array("message", {
          length: "length",
          type: elementParser
        })

      let buffer = Buffer.from([
        0x02,
        0x00,
        0xca,
        0xd2,
        0x04,
        0xbe,
        0xd3,
        0x04
      ])

      expect(parser.parse(buffer)).toEqual({
        length: 0x02,
        message: [{ key: 0xca, value: 1234 }, { key: 0xbe, value: 1235 }]
      })
    })

    it("should parse array of user defined types with lengthInBytes", () => {
      let elementParser = new Parser().uint8("key").int16le("value")

      let parser = Parser.start()
        .uint16le("length")
        .array("message", {
          lengthInBytes: "length",
          type: elementParser
        })

      let buffer = Buffer.from([
        0x06,
        0x00,
        0xca,
        0xd2,
        0x04,
        0xbe,
        0xd3,
        0x04
      ])

      expect(parser.parse(buffer)).toEqual({
        length: 0x06,
        message: [{ key: 0xca, value: 1234 }, { key: 0xbe, value: 1235 }]
      })
    })

    it("should parse array of user defined types with lengthInBytes literal", () => {
      let elementParser = new Parser().uint8("key").int16le("value")

      let parser = Parser.start().array("message", {
        lengthInBytes: 0x06,
        type: elementParser
      })

      let buffer = Buffer.from([0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04])
      expect(parser.parse(buffer)).toEqual({
        message: [{ key: 0xca, value: 1234 }, { key: 0xbe, value: 1235 }]
      })
    })

    it("should parse array of user defined types with lengthInBytes ", () => {
      let elementParser = new Parser().uint8("key").int16le("value")

      let parser = Parser.start()
        .uint16le("length")
        .array("message", {
          lengthInBytes: function() {
            return this.length
          },
          type: elementParser
        })

      let buffer = Buffer.from([
        0x06,
        0x00,
        0xca,
        0xd2,
        0x04,
        0xbe,
        0xd3,
        0x04
      ])

      expect(parser.parse(buffer)).toEqual({
        length: 0x06,
        message: [{ key: 0xca, value: 1234 }, { key: 0xbe, value: 1235 }]
      })
    })

    it("should parse array of arrays", () => {
      let rowParser = Parser.start()
        .uint8("length")
        .array("cols", {
          length: "length",
          type: "int32le"
        })

      let parser = Parser.start()
        .uint8("length")
        .array("rows", {
          length: "length",
          type: rowParser
        })

      let buffer = Buffer.alloc(1 + 10 * (1 + 5 * 4))

      let iterator = 0
      buffer.writeUInt8(10, iterator)
      iterator += 1
      for (let i = 0; i < 10; i++) {
        buffer.writeUInt8(5, iterator)
        iterator += 1
        for (let j = 0; j < 5; j++) {
          buffer.writeInt32LE(i * j, iterator)
          iterator += 4
        }
      }

      expect(parser.parse(buffer)).toEqual({
        length: 10,
        rows: [
          { length: 5, cols: [0, 0, 0, 0, 0] },
          { length: 5, cols: [0, 1, 2, 3, 4] },
          { length: 5, cols: [0, 2, 4, 6, 8] },
          { length: 5, cols: [0, 3, 6, 9, 12] },
          { length: 5, cols: [0, 4, 8, 12, 16] },
          { length: 5, cols: [0, 5, 10, 15, 20] },
          { length: 5, cols: [0, 6, 12, 18, 24] },
          { length: 5, cols: [0, 7, 14, 21, 28] },
          { length: 5, cols: [0, 8, 16, 24, 32] },
          { length: 5, cols: [0, 9, 18, 27, 36] }
        ]
      })
    })

    it("should parse until eof when readUntil is specified", () => {
      let parser = Parser.start().array("data", {
        readUntil: "eof",
        type: "uint8"
      })

      let buffer = Buffer.from([
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff
      ])

      expect(parser.parse(buffer)).toEqual({
        data: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
      })
    })

    it("should parse until  returns true when readUntil is ", () => {
      let parser = Parser.start().array("data", {
        readUntil: (item, buf) => {
          return item === 0
        },
        type: "uint8"
      })

      let buffer = Buffer.from([
        0xff,
        0xff,
        0xff,
        0x01,
        0x00,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff
      ])

      expect(parser.parse(buffer)).toEqual({
        data: [0xff, 0xff, 0xff, 0x01, 0x00]
      })
    })

    it("should parse until  returns true when readUntil is  (using read-ahead)", () => {
      let parser = Parser.start().array("data", {
        readUntil: (item, buf) => {
          return buf.length > 0 && buf.readUInt8(0) === 0
        },
        type: "uint8"
      })

      let buffer = Buffer.from([
        0xff,
        0xff,
        0xff,
        0x01,
        0x00,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff
      ])

      expect(parser.parse(buffer)).toEqual({
        data: [0xff, 0xff, 0xff, 0x01]
      })
    })

    it("should parse associative arrays", () => {
      let parser = Parser.start()
        .int8("numlumps")
        .array("lumps", {
          type: Parser.start()
            .int32le("filepos")
            .int32le("size")
            .string("name", { length: 8, encoding: "ascii" }),
          length: "numlumps",
          key: "name"
        })

      let buffer = Buffer.from([
        0x02,
        0xd2,
        0x04,
        0x00,
        0x00,
        0x2e,
        0x16,
        0x00,
        0x00,
        0x41,
        0x41,
        0x41,
        0x41,
        0x41,
        0x41,
        0x41,
        0x41,
        0x2e,
        0x16,
        0x00,
        0x00,
        0xd2,
        0x04,
        0x00,
        0x00,
        0x62,
        0x62,
        0x62,
        0x62,
        0x62,
        0x62,
        0x62,
        0x62
      ])

      expect(parser.parse(buffer)).toEqual({
        numlumps: 2,
        lumps: {
          AAAAAAAA: {
            filepos: 1234,
            size: 5678,
            name: "AAAAAAAA"
          },
          bbbbbbbb: {
            filepos: 5678,
            size: 1234,
            name: "bbbbbbbb"
          }
        }
      })
    })

    it("should use formatter to transform parsed array", () => {
      let parser = Parser.start().array("data", {
        type: "uint8",
        length: 4,
        formatter: (arr) => {
          return arr.join(".")
        }
      })

      let buffer = Buffer.from([0x0a, 0x0a, 0x01, 0x6e])
      expect(parser.parse(buffer)).toEqual({
        data: "10.10.1.110"
      })
    })

    it("should be able to go into recursion", () => {
      let parser = Parser.start()
        .namely("self")
        .uint8("length")
        .array("data", {
          type: "self",
          length: "length"
        })

      let buffer = Buffer.from([1, 1, 1, 0])
      expect(parser.parse(buffer)).toEqual({
        length: 1,
        data: [
          {
            length: 1,
            data: [
              {
                length: 1,
                data: [{ length: 0, data: [] }]
              }
            ]
          }
        ]
      })
    })

    it("should be able to go into even deeper recursion", () => {
      let parser = Parser.start()
        .namely("self")
        .uint8("length")
        .array("data", {
          type: "self",
          length: "length"
        })

      //        2
      //       / \
      //      3   1
      //    / | \  \
      //   1  0  2  0
      //  /     / \
      // 0     1   0
      //      /
      //     0

      let buffer = Buffer.from([
        2,
        /* 0 */ 3,
        /* 0 */ 1,
        /* 0 */ 0,
        /* 1 */ 0,
        /* 2 */ 2,
        /* 0 */ 1,
        /* 0 */ 0,
        /* 1 */ 0,
        /* 1 */ 1,
        /* 0 */ 0
      ])

      expect(parser.parse(buffer)).toEqual({
        length: 2,
        data: [
          {
            length: 3,
            data: [
              { length: 1, data: [{ length: 0, data: [] }] },
              { length: 0, data: [] },
              {
                length: 2,
                data: [
                  { length: 1, data: [{ length: 0, data: [] }] },
                  { length: 0, data: [] }
                ]
              }
            ]
          },
          {
            length: 1,
            data: [{ length: 0, data: [] }]
          }
        ]
      })
    })

    it("should allow parent parser attributes as choice key", () => {
      let ChildParser = Parser.start().choice("data", {
        tag: (vars) => {
          return vars.version
        },
        choices: {
          1: Parser.start().uint8("v1"),
          2: Parser.start().uint16("v2")
        }
      })

      let ParentParser = Parser.start()
        .uint8("version")
        .nest("child", { type: ChildParser })

      let buffer = Buffer.from([0x1, 0x2])
      expect(ParentParser.parse(buffer)).toEqual({
        version: 1,
        child: { data: { v1: 2 } }
      })

      buffer = Buffer.from([0x2, 0x3, 0x4])
      expect(ParentParser.parse(buffer)).toEqual({
        version: 2,
        child: { data: { v2: 0x0304 } }
      })
    })
  })

  describe("Choice parser", () => {
    it("should parse choices of primitive types", () => {
      let parser = Parser.start()
        .uint8("tag1")
        .choice("data1", {
          tag: "tag1",
          choices: {
            0: "int32le",
            1: "int16le"
          }
        })
        .uint8("tag2")
        .choice("data2", {
          tag: "tag2",
          choices: {
            0: "int32le",
            1: "int16le"
          }
        })

      let buffer = Buffer.from([0x0, 0x4e, 0x61, 0xbc, 0x00, 0x01, 0xd2, 0x04])
      expect(parser.parse(buffer)).toEqual({
        tag1: 0,
        data1: 12345678,
        tag2: 1,
        data2: 1234
      })
    })

    it("should parse default choice", () => {
      let parser = Parser.start()
        .uint8("tag")
        .choice("data", {
          tag: "tag",
          choices: {
            0: "int32le",
            1: "int16le"
          },
          defaultChoice: "uint8"
        })
        .int32le("test")

      buffer = Buffer.from([0x03, 0xff, 0x2f, 0xcb, 0x04, 0x0])
      expect(parser.parse(buffer)).toEqual({
        tag: 3,
        data: 0xff,
        test: 314159
      })
    })

    it("should parse choices of user defied types", () => {
      let parser = Parser.start()
        .uint8("tag")
        .choice("data", {
          tag: "tag",
          choices: {
            1: Parser.start()
              .uint8("length")
              .string("message", { length: "length" }),
            3: Parser.start().int32le("number")
          }
        })

      let buffer = Buffer.from([
        0x1,
        0xc,
        0x68,
        0x65,
        0x6c,
        0x6c,
        0x6f,
        0x2c,
        0x20,
        0x77,
        0x6f,
        0x72,
        0x6c,
        0x64
      ])

      expect(parser.parse(buffer)).toEqual({
        tag: 1,
        data: {
          length: 12,
          message: "hello, world"
        }
      })

      buffer = Buffer.from([0x03, 0x4e, 0x61, 0xbc, 0x00])
      expect(parser.parse(buffer)).toEqual({
        tag: 3,
        data: {
          number: 12345678
        }
      })
    })

    it("should be able to go into recursion", () => {
      let stop = Parser.start()

      let parser = Parser.start()
        .namely("self")
        .uint8("type")
        .choice("data", {
          tag: "type",
          choices: {
            0: stop,
            1: "self"
          }
        })

      let buffer = Buffer.from([1, 1, 1, 0])
      expect(parser.parse(buffer)).toEqual({
        type: 1,
        data: {
          type: 1,
          data: {
            type: 1,
            data: { type: 0, data: {} }
          }
        }
      })
    })

    it("should be able to go into recursion with simple nesting", () => {
      let stop = Parser.start()

      let parser = Parser.start()
        .namely("self")
        .uint8("type")
        .choice("data", {
          tag: "type",
          choices: {
            0: stop,
            1: "self",
            2: Parser.start()
              .nest("left", { type: "self" })
              .nest("right", { type: stop })
          }
        })

      let buffer = Buffer.from([2, /* left */ 1, 1, 0, /* right */ 0])
      expect(parser.parse(buffer)).toEqual({
        type: 2,
        data: {
          left: {
            type: 1,
            data: { type: 1, data: { type: 0, data: {} } }
          },
          right: {}
        }
      })
    })

    it("should be able to refer to other parsers by name", () => {
      let parser = Parser.start().namely("self")

      let stop = Parser.start().namely("stop")

      let twoCells = Parser.start()
        .namely("twoCells")
        .nest("left", { type: "self" })
        .nest("right", { type: "stop" })

      parser.uint8("type").choice("data", {
        tag: "type",
        choices: {
          0: "stop",
          1: "self",
          2: "twoCells"
        }
      })

      let buffer = Buffer.from([2, /* left */ 1, 1, 0, /* right */ 0])
      expect(parser.parse(buffer)).toEqual({
        type: 2,
        data: {
          left: {
            type: 1,
            data: { type: 1, data: { type: 0, data: {} } }
          },
          right: {}
        }
      })
    })

    it("should be able to refer to other parsers both directly and by name", () => {
      let parser = Parser.start().namely("self")

      let stop = Parser.start()

      let twoCells = Parser.start()
        .nest("left", { type: "self" })
        .nest("right", { type: stop })

      parser.uint8("type").choice("data", {
        tag: "type",
        choices: {
          0: stop,
          1: "self",
          2: twoCells
        }
      })

      let buffer = Buffer.from([2, /* left */ 1, 1, 0, /* right */ 0])
      expect(parser.parse(buffer)).toEqual({
        type: 2,
        data: {
          left: {
            type: 1,
            data: { type: 1, data: { type: 0, data: {} } }
          },
          right: {}
        }
      })
    })

    it("should be able to go into recursion with complex nesting", () => {
      let stop = Parser.start()

      let parser = Parser.start()
        .namely("self")
        .uint8("type")
        .choice("data", {
          tag: "type",
          choices: {
            0: stop,
            1: "self",
            2: Parser.start()
              .nest("left", { type: "self" })
              .nest("right", { type: "self" }),
            3: Parser.start()
              .nest("one", { type: "self" })
              .nest("two", { type: "self" })
              .nest("three", { type: "self" })
          }
        })

      //        2
      //       / \
      //      3   1
      //    / | \  \
      //   1  0  2  0
      //  /     / \
      // 0     1   0
      //      /
      //     0

      let buffer = Buffer.from([
        2,
        /* left -> */ 3,
        /* one   -> */ 1,
        /* -> */ 0,
        /* two   -> */ 0,
        /* three -> */ 2,
        /* left  -> */ 1,
        /* -> */ 0,
        /* right -> */ 0,
        /* right -> */ 1,
        /* -> */ 0
      ])
      expect(parser.parse(buffer)).toEqual({
        type: 2,
        data: {
          left: {
            type: 3,
            data: {
              one: { type: 1, data: { type: 0, data: {} } },
              two: { type: 0, data: {} },
              three: {
                type: 2,
                data: {
                  left: { type: 1, data: { type: 0, data: {} } },
                  right: { type: 0, data: {} }
                }
              }
            }
          },
          right: {
            type: 1,
            data: { type: 0, data: {} }
          }
        }
      })
    })

    it("should be able to 'flatten' choices when using null varName", () => {
      let parser = Parser.start()
        .uint8("tag")
        .choice(null, {
          tag: "tag",
          choices: {
            1: Parser.start()
              .uint8("length")
              .string("message", { length: "length" }),
            3: Parser.start().int32le("number")
          }
        })

      let buffer = Buffer.from([
        0x1,
        0xc,
        0x68,
        0x65,
        0x6c,
        0x6c,
        0x6f,
        0x2c,
        0x20,
        0x77,
        0x6f,
        0x72,
        0x6c,
        0x64
      ])
      expect(parser.parse(buffer)).toEqual({
        tag: 1,
        length: 12,
        message: "hello, world"
      })
      buffer = Buffer.from([0x03, 0x4e, 0x61, 0xbc, 0x00])
      expect(parser.parse(buffer)).toEqual({
        tag: 3,
        number: 12345678
      })
    })

    it("should be able to 'flatten' choices when omitting varName paramater", () => {
      let parser = Parser.start()
        .uint8("tag")
        .choice({
          tag: "tag",
          choices: {
            1: Parser.start()
              .uint8("length")
              .string("message", { length: "length" }),
            3: Parser.start().int32le("number")
          }
        })

      let buffer = Buffer.from([
        0x1,
        0xc,
        0x68,
        0x65,
        0x6c,
        0x6c,
        0x6f,
        0x2c,
        0x20,
        0x77,
        0x6f,
        0x72,
        0x6c,
        0x64
      ])

      expect(parser.parse(buffer)).toEqual({
        tag: 1,
        length: 12,
        message: "hello, world"
      })

      buffer = Buffer.from([0x03, 0x4e, 0x61, 0xbc, 0x00])
      expect(parser.parse(buffer)).toEqual({
        tag: 3,
        number: 12345678
      })
    })

    it("should be able to use  as the choice selector", () => {
      let parser = Parser.start()
        .string("selector", { length: 4 })
        .choice(null, {
          tag: function() {
            return parseInt(this.selector, 2) // string base 2 to integer decimal
          },
          choices: {
            2: Parser.start()
              .uint8("length")
              .string("message", { length: "length" }),
            7: Parser.start().int32le("number")
          }
        })

      let buffer = Buffer.from([
        48,
        48,
        49,
        48,
        0xc,
        0x68,
        0x65,
        0x6c,
        0x6c,
        0x6f,
        0x2c,
        0x20,
        0x77,
        0x6f,
        0x72,
        0x6c,
        0x64
      ])

      expect(parser.parse(buffer)).toEqual({
        selector: "0010", // -> choice 2
        length: 12,
        message: "hello, world"
      })
      buffer = Buffer.from([48, 49, 49, 49, 0x4e, 0x61, 0xbc, 0x00])
      expect(parser.parse(buffer)).toEqual({
        selector: "0111", // -> choice 7
        number: 12345678
      })
    })
  })

  describe("Nest parser", () => {
    it("should parse nested parsers", () => {
      let nameParser = new Parser()
        .string("firstName", {
          zeroTerminated: true
        })
        .string("lastName", {
          zeroTerminated: true
        })
      let infoParser = new Parser().uint8("age")
      let personParser = new Parser()
        .nest("name", {
          type: nameParser
        })
        .nest("info", {
          type: infoParser
        })

      let buffer = Buffer.concat([
        Buffer.from("John\0Doe\0"),
        Buffer.from([0x20])
      ])
      expect(personParser.parse(buffer)).toEqual({
        name: {
          firstName: "John",
          lastName: "Doe"
        },
        info: {
          age: 0x20
        }
      })
    })

    it("should format parsed nested parser", () => {
      let nameParser = new Parser()
        .string("firstName", {
          zeroTerminated: true
        })
        .string("lastName", {
          zeroTerminated: true
        })
      let personParser = new Parser().nest("name", {
        type: nameParser,
        formatter: (name) => {
          return name.firstName + " " + name.lastName
        }
      })

      let buffer = Buffer.from("John\0Doe\0")
      expect(personParser.parse(buffer)).toEqual({
        name: "John Doe"
      })
    })

    it("should 'flatten' output when using null varName", () => {
      let parser = new Parser()
        .string("s1", { zeroTerminated: true })
        .nest(null, {
          type: new Parser().string("s2", { zeroTerminated: true })
        })

      let buf = Buffer.from("foo\0bar\0")

      expect(parser.parse(buf)).toEqual({ s1: "foo", s2: "bar" })
    })

    it("should 'flatten' output when omitting varName", () => {
      let parser = new Parser().string("s1", { zeroTerminated: true }).nest({
        type: new Parser().string("s2", { zeroTerminated: true })
      })

      let buf = Buffer.from("foo\0bar\0")

      expect(parser.parse(buf)).toEqual({ s1: "foo", s2: "bar" })
    })
  })

  describe("Buffer parser", () => {
    //this is a test for testing a fix of a bug, that removed the last byte of the
    //buffer parser
    it("should return a buffer with same size", () => {
      let bufferParser = new Parser().buffer("buf", {
        readUntil: "eof",
        formatter: (buffer) => {
          return buffer
        }
      })

      let buffer = Buffer.from("John\0Doe\0")
      expect(bufferParser.parse(buffer)).toEqual({ buf: buffer })
    })
  })

  describe("Constructors", () => {
    it("should create a custom object type", () => {
      class Person {
        constructor() {
          this.name = ""
        }

        toString() {
          return "[object Person]"
        }
      }

      let parser = Parser.start()
        .create(Person)
        .string("name", {
          zeroTerminated: true
        })

      let buffer = Buffer.from("John Doe\0")
      let person = parser.parse(buffer)
      expect(person).toBeInstanceOf(Person)
      expect(person.name).toEqual("John Doe")
    })
  })

  describe("Utilities", () => {
    it("should count size for fixed size structs", () => {
      let parser = Parser.start()
        .int8("a")
        .int32le("b")
        .string("msg", { length: 10 })
        .skip(2)
        .array("data", {
          length: 3,
          type: "int8"
        })
        .buffer("raw", { length: 8 })

      expect(parser.sizeOf()).toEqual(1 + 4 + 10 + 2 + 3 + 8)
    })

    it("should assert parsed values", () => {
      let parser = Parser.start().string("msg", {
        encoding: "ascii",
        zeroTerminated: true,
        assert: "hello, world"
      })
      let buffer = Buffer.from("68656c6c6f2c20776f726c6400", "hex")
      expect(() => parser.parse(buffer)).not.toThrow()

      buffer = Buffer.from("68656c6c6f2c206a7300", "hex")
      expect(() => parser.parse(buffer)).toThrow()

      parser = new Parser()
        .int16le("a")
        .int16le("b")
        .int16le("c", {
          assert: function(x) {
            return this.a + this.b === x
          }
        })

      buffer = Buffer.from("d2042e16001b", "hex")
      expect(() => parser.parse(buffer)).not.toThrow()

      buffer = Buffer.from("2e16001bd204", "hex")
      expect(() => parser.parse(buffer)).toThrow()
    })
  })

  describe("Parse other fields after bit", () => {
    it("Parse uint8", () => {
      let buffer = Buffer.from([0, 1, 0, 4])
      for (let i = 17; i <= 24; i++) {
        let parser = Parser.start()
          ["bit" + i]("a")
          .uint8("b")

        expect(parser.parse(buffer)).toEqual({
          a: 1 << (i - 16),
          b: 4
        })
      }
    })
  })
})
