const vm = require('vm')
const Context = require('./context')

/**
 *
 * @type {{UInt16LE: number, Int16BE: number, UInt32BE: number, Int32BE: number, UInt32LE: number, DoubleLE: number, Int8: number, UInt8: number, Int32LE: number, FloatBE: number, DoubleBE: number, Int16LE: number, UInt16BE: number, FloatLE: number}}
 */
const PRIMITIVE_TYPES = {
  UInt8: 1,
  UInt16LE: 2,
  UInt16BE: 2,
  UInt32LE: 4,
  UInt32BE: 4,
  Int8: 1,
  Int16LE: 2,
  Int16BE: 2,
  Int32LE: 4,
  Int32BE: 4,
  FloatLE: 4,
  FloatBE: 4,
  DoubleLE: 8,
  DoubleBE: 8
}

/**
 *
 * @type {{Buffer: null, Array: null, Choice: null, Skip: null, String: null, Nest: null, Bit: null}}
 */
const SPECIAL_TYPES = {
  String: null,
  Buffer: null,
  Array: null,
  Skip: null,
  Choice: null,
  Nest: null,
  Bit: null
}

let aliasRegistry = {}
const FUNCTION_PREFIX = '___parser_'

let BIT_RANGE = Array.from({ length: 32 }, (v, k) => k + 1)

// Converts Parser's method names to internal type names
let NAME_MAP = {}
Object.keys(PRIMITIVE_TYPES)
  .concat(Object.keys(SPECIAL_TYPES))
  .forEach((type) => {
    NAME_MAP[type.toLowerCase()] = type
  })

/**
 *
 */
class Parser {
  constructor (customInjections) {
    this.varName = ''
    this.type = ''
    this.options = {}
    this.next = null
    this.head = null
    this.compiled = null
    this.endian = 'be'
    this.constructorFn = null
    this.alias = null
    this.customInjections = customInjections || {}
    this._addTypeMethods()
  }

  static start (opts) {
    return new Parser(opts)
  }

  namely (alias) {
    aliasRegistry[alias] = this
    this.alias = alias
    return this
  }

  skip (length, options) {
    if (options && options.assert) {
      throw new Error('assert option on skip is not allowed.')
    }

    return this._setNextParser('skip', '', { length: length })
  }

  skipBit (length, options) {
    if (options && options.assert) {
      throw new Error('assert option on skip is not allowed.')
    }

    return this[`bit${length}`]('__skipped__')
  }

  string (varName, options) {
    if (!options.zeroTerminated && !options.length && !options.greedy) {
      throw new Error(
        'Neither length, zeroTerminated, nor greedy is defined for string.'
      )
    }
    if ((options.zeroTerminated || options.length) && options.greedy) {
      throw new Error(
        'greedy is mutually exclusive with length and zeroTerminated for string.'
      )
    }
    if (options.stripNull && !(options.length || options.greedy)) {
      throw new Error(
        'Length or greedy must be defined if stripNull is defined.'
      )
    }
    options.encoding = options.encoding || 'utf8'

    return this._setNextParser('string', varName, options)
  }

  buffer (varName, options) {
    if (!options.length && !options.readUntil) {
      throw new Error('Length nor readUntil is defined in buffer parser')
    }

    return this._setNextParser('buffer', varName, options)
  }

  array (varName, options) {
    if (!options.readUntil && !options.length && !options.lengthInBytes) {
      throw new Error('Length option of array is not defined.')
    }
    if (!options.type) {
      throw new Error('Type option of array is not defined.')
    }
    if (
      typeof options.type === 'string' &&
      !aliasRegistry[options.type] &&
      Object.keys(PRIMITIVE_TYPES).indexOf(NAME_MAP[options.type]) < 0
    ) {
      throw new Error(
        'Specified primitive type "' + options.type + '" is not supported.'
      )
    }

    return this._setNextParser('array', varName, options)
  }

  choice (varName, options) {
    if (arguments.length === 1 && typeof varName === 'object') {
      options = varName
      varName = null
    }

    if (!options.tag) {
      throw new Error('Tag option of array is not defined.')
    }
    if (!options.choices) {
      throw new Error('Choices option of array is not defined.')
    }

    Object.keys(options.choices).forEach((key) => {
      if (isNaN(parseInt(key, 10))) {
        throw new Error('Key of choices must be a number.')
      }
      if (!options.choices[key]) {
        throw new Error(
          'Choice Case ' + key + ' of ' + varName + ' is not valid.'
        )
      }

      if (
        typeof options.choices[key] === 'string' &&
        !aliasRegistry[options.choices[key]] &&
        Object.keys(PRIMITIVE_TYPES).indexOf(NAME_MAP[options.choices[key]]) < 0
      ) {
        throw new Error(
          'Specified primitive type "' +
          options.choices[key] +
          '" is not supported.'
        )
      }
    }, this)

    return this._setNextParser('choice', varName, options)
  }

  nest (varName, options) {
    if (arguments.length === 1 && typeof varName === 'object') {
      options = varName
      varName = null
    }

    if (!options.type) {
      throw new Error('Type option of nest is not defined.')
    }
    if (!(options.type instanceof Parser) && !aliasRegistry[options.type]) {
      throw new Error('Type option of nest must be a Parser object.')
    }
    if (!(options.type instanceof Parser) && !varName) {
      throw new Error(
        'options.type must be a object if variable name is omitted.'
      )
    }

    return this._setNextParser('nest', varName, options)
  }

  endianess (endianess) {
    switch (endianess.toLowerCase()) {
      case 'little':
        this.endian = 'le'
        break
      case 'big':
        this.endian = 'be'
        break
      default:
        throw new Error('Invalid endianess: ' + endianess)
    }

    return this
  }

  create (constructorFn) {
    if (!(constructorFn instanceof Function)) {
      throw new Error('Constructor must be a Function object.')
    }

    this.constructorFn = constructorFn

    return this
  }

  getCode () {
    let ctx = new Context()

    ctx.pushCode('if (!Buffer.isBuffer(buffer)) {')
    ctx.generateError('"argument buffer is not a Buffer object"')
    ctx.pushCode('}')

    if (!this.alias) {
      this.addRawCode(ctx)
    } else {
      this.addAliasedCode(ctx)
    }

    if (this.alias) {
      ctx.pushCode('var res = {0}(0).result;', FUNCTION_PREFIX + this.alias)
      ctx.pushCode('if(res.hasOwnProperty("__skipped__")) {delete res["__skipped__"];}')
      ctx.pushCode('return res;')
    } else {
      ctx.pushCode('if(vars.hasOwnProperty("__skipped__")) {delete vars["__skipped__"];}')
      ctx.pushCode('return vars;')
    }

    return ctx.code
  }

  addRawCode (ctx) {
    ctx.pushCode('var offset = 0;')

    if (this.constructorFn) {
      ctx.pushCode('var vars = new constructorFn();')
    } else {
      ctx.pushCode('var vars = {};')
    }

    this._generate(ctx)

    this.resolveReferences(ctx)

    // ctx.pushCode('return vars;')
  }

  addAliasedCode (ctx) {
    ctx.pushCode('function {0}(offset) {', FUNCTION_PREFIX + this.alias)

    if (this.constructorFn) {
      ctx.pushCode('var vars = new constructorFn();')
    } else {
      ctx.pushCode('var vars = {};')
    }

    this._generate(ctx)

    ctx.markResolved(this.alias)
    this.resolveReferences(ctx)

    ctx.pushCode('return { offset: offset, result: vars };')
    ctx.pushCode('}')

    return ctx
  }

  resolveReferences (ctx) {
    let references = ctx.getUnresolvedReferences()
    ctx.markRequested(references)
    references.forEach((alias) => {
      let parser = aliasRegistry[alias]
      parser.addAliasedCode(ctx)
    })
  }

  compile () {
    let src = '(function(buffer, constructorFn) { ' + this.getCode() + ' })'
    this.compiled = vm.runInNewContext(src, { Buffer, ...this.customInjections })
  }

  sizeOf () {
    let size = NaN

    if (Object.keys(PRIMITIVE_TYPES).indexOf(this.type) >= 0) {
      size = PRIMITIVE_TYPES[this.type]

      // if this is a fixed length string
    } else if (
      this.type === 'String' &&
      typeof this.options.length === 'number'
    ) {
      size = this.options.length

      // if this is a fixed length buffer
    } else if (
      this.type === 'Buffer' &&
      typeof this.options.length === 'number'
    ) {
      size = this.options.length

      // if this is a fixed length array
    } else if (this.type === 'Array' && typeof this.options.length === 'number') {
      let elementSize = NaN
      if (typeof this.options.type === 'string') {
        elementSize = PRIMITIVE_TYPES[NAME_MAP[this.options.type]]
      } else if (this.options.type instanceof Parser) {
        elementSize = this.options.type.sizeOf()
      }
      size = this.options.length * elementSize

      // if this a skip
    } else if (this.type === 'Skip') {
      size = this.options.length

      // if this is a nested parser
    } else if (this.type === 'Nest') {
      size = this.options.type.sizeOf()
    } else if (!this.type) {
      size = 0
    }

    if (this.next) {
      size += this.next.sizeOf()
    }

    return size
  }

  parse (buffer) {
    if (!this.compiled) {
      this.compile()
    }

    return this.compiled(buffer, this.constructorFn)
  }

  // ==========================================================

  _addTypeMethods () {
    this._addBitMethods()
    this._addPrimitiveGenerateMethods()
    this._addPrimitveMethods()
  }

  _addBitMethods () {
    BIT_RANGE.forEach((i) => {
      this['bit' + i.toString()] = (varName, options) => {
        if (!options) {
          options = {}
        }
        options.length = i
        return this._setNextParser('bit', varName, options)
      }
    })
  }

  _addPrimitveMethods () {
    Object.keys(PRIMITIVE_TYPES).forEach((type) => {
      this[type.toLowerCase()] = (varName, options) => {
        return this._setNextParser(type.toLowerCase(), varName, options)
      }

      let typeWithoutEndian = type.replace(/BE|LE/, '').toLowerCase()
      if (!(typeWithoutEndian in this)) {
        this[typeWithoutEndian] = (varName, options) => {
          return this[typeWithoutEndian + this.endian](varName, options)
        }
      }
    })
  }

  _addPrimitiveGenerateMethods () {
    Object.keys(PRIMITIVE_TYPES).forEach((type) => {
      this['_generate' + type] = (ctx) => {
        ctx.pushCode(
          '{0} = buffer.read{1}(offset);',
          ctx.generateVariable(this.varName),
          type
        )
        ctx.pushCode('offset += {0};', PRIMITIVE_TYPES[type])
      }
    })
  }

  _setNextParser (type, varName, options) {
    let parser = new Parser(this.customInjections)

    parser.type = NAME_MAP[type]
    parser.varName = varName
    parser.options = options || parser.options
    parser.endian = this.endian

    if (this.head) {
      this.head.next = parser
    } else {
      this.next = parser
    }
    this.head = parser

    return this
  }

  _generate (ctx) {
    if (this.type) {
      if (typeof this['_generate' + this.type] !== 'function') { console.log('_generate' + this.type) }
      this['_generate' + this.type](ctx)
      this._generateAssert(ctx)
    }

    let varName = ctx.generateVariable(this.varName)
    if (this.options.formatter && !this.type.startsWith('Bit')) {
      this._generateFormatter(ctx, varName, this.options.formatter)
    }

    return this._generateNext(ctx)
  }

  _generateAssert (ctx) {
    if (!this.options.assert) {
      return
    }

    let varName = ctx.generateVariable(this.varName)

    switch (typeof this.options.assert) {
      case 'function':
        ctx.pushCode(
          'if (!({0}).call(vars, {1})) {',
          this.options.assert,
          varName
        )
        break
      case 'number':
        ctx.pushCode('if ({0} !== {1}) {', this.options.assert, varName)
        break
      case 'string':
        ctx.pushCode('if ("{0}" !== {1}) {', this.options.assert, varName)
        break
      default:
        throw new Error(
          'Assert option supports only strings, numbers and assert functions.'
        )
    }
    ctx.generateError('"Assert error: {0} is " + {0}', varName)
    ctx.pushCode('}')
  }

  _generateNext (ctx) {
    if (this.next) {
      ctx = this.next._generate(ctx)
    }

    return ctx
  }

  _generateBit (ctx) {
    // TODO find better method to handle nested bit fields
    let parser = JSON.parse(JSON.stringify(this))
    parser.options = this.options
    parser.varName = ctx.generateVariable(parser.varName)
    ctx.bitFields.push(parser)

    if (
      !this.next ||
      (this.next && ['Bit', 'Nest'].indexOf(this.next.type) < 0)
    ) {
      // This is the total length of all bits
      // sum will always be viewed as the the next larger byte size (1, 2, 3 ...)
      let sum = 0

      ctx.bitFields.forEach((parser) => {
        sum += parser.options.length
      })

      let val = ctx.generateTmpVariable()

      if (sum <= 8) {
        ctx.pushCode('var {0} = buffer.readUInt8(offset);', val)
        sum = 8
      } else if (sum <= 16) {
        ctx.pushCode('var {0} = buffer.readUInt16BE(offset);', val)
        sum = 16
      } else if (sum <= 24) {
        let val1 = ctx.generateTmpVariable()
        let val2 = ctx.generateTmpVariable()
        ctx.pushCode('var {0} = buffer.readUInt16BE(offset);', val1)
        ctx.pushCode('var {0} = buffer.readUInt8(offset + 2);', val2)
        ctx.pushCode('var {2} = ({0} << 8) | {1};', val1, val2, val)
        sum = 24
      } else if (sum <= 32) {
        ctx.pushCode('var {0} = buffer.readUInt32BE(offset);', val)
        sum = 32
      } else {
        throw new Error(
          'Currently, bit field sequence longer than 4-bytes is not supported.'
        )
      }
      ctx.pushCode('offset += {0};', sum / 8)

      let bitOffset = 0
      let isBigEndian = this.endian === 'be'
      ctx.bitFields.forEach((parser) => {
        ctx.pushCode(
          '{0} = {1} >> {2} & {3};',
          parser.varName,
          val,
          isBigEndian ? sum - bitOffset - parser.options.length : bitOffset,
          (1 << parser.options.length) - 1
        )

        if (parser.options.formatter) {
          Parser.prototype._generateFormatter.call(
            parser, ctx, parser.varName, parser.options.formatter)
        }

        bitOffset += parser.options.length
      })

      ctx.bitFields = []
    }
  }

  _generateSkip (ctx) {
    var length = ctx.generateOption(this.options.length)
    ctx.pushCode('offset += {0};', length)
  }

  _generateString (ctx) {
    let name = ctx.generateVariable(this.varName)
    let start = ctx.generateTmpVariable()

    if (this.options.length && this.options.zeroTerminated) {
      ctx.pushCode('var {0} = offset;', start)
      ctx.pushCode(
        'while(buffer.readUInt8(offset++) !== 0 && offset - {0}  < {1});',
        start,
        this.options.length
      )
      ctx.pushCode(
        "{0} = buffer.toString('{1}', {2}, offset - {2} < {3} ? offset - 1 : offset);",
        name,
        this.options.encoding,
        start,
        this.options.length
      )
    } else if (this.options.length) {
      ctx.pushCode(
        "{0} = buffer.toString('{1}', offset, offset + {2});",
        name,
        this.options.encoding,
        ctx.generateOption(this.options.length)
      )
      ctx.pushCode('offset += {0};', ctx.generateOption(this.options.length))
    } else if (this.options.zeroTerminated) {
      ctx.pushCode('var {0} = offset;', start)
      ctx.pushCode('while(buffer.readUInt8(offset++) !== 0);')
      ctx.pushCode(
        "{0} = buffer.toString('{1}', {2}, offset - 1);",
        name,
        this.options.encoding,
        start
      )
    } else if (this.options.greedy) {
      ctx.pushCode('var {0} = offset;', start)
      ctx.pushCode('while(buffer.length > offset++);')
      ctx.pushCode(
        "{0} = buffer.toString('{1}', {2}, offset);",
        name,
        this.options.encoding,
        start
      )
    }
    if (this.options.stripNull) {
      ctx.pushCode("{0} = {0}.replace(/\\x00+$/g, '')", name)
    }
  }

  _generateBuffer (ctx) {
    if (this.options.readUntil === 'eof') {
      ctx.pushCode(
        '{0} = buffer.slice(offset);',
        ctx.generateVariable(this.varName)
      )
    } else {
      ctx.pushCode(
        '{0} = buffer.slice(offset, offset + {1});',
        ctx.generateVariable(this.varName),
        ctx.generateOption(this.options.length)
      )
      ctx.pushCode('offset += {0};', ctx.generateOption(this.options.length))
    }

    if (this.options.clone) {
      ctx.pushCode('{0} = Buffer.from({0});', ctx.generateVariable(this.varName))
    }
  }

  _generateArray (ctx) {
    let length = ctx.generateOption(this.options.length)
    let lengthInBytes = ctx.generateOption(this.options.lengthInBytes)
    let type = this.options.type
    let counter = ctx.generateTmpVariable()
    let lhs = ctx.generateVariable(this.varName)
    let item = ctx.generateTmpVariable()
    let key = this.options.key
    let isHash = typeof key === 'string'

    if (isHash) {
      ctx.pushCode('{0} = {};', lhs)
    } else {
      ctx.pushCode('{0} = [];', lhs)
    }
    if (typeof this.options.readUntil === 'function') {
      ctx.pushCode('do {')
    } else if (this.options.readUntil === 'eof') {
      ctx.pushCode('for (var {0} = 0; offset < buffer.length; {0}++) {', counter)
    } else if (lengthInBytes !== undefined) {
      ctx.pushCode(
        'for (var {0} = offset; offset - {0} < {1}; ) {',
        counter,
        lengthInBytes
      )
    } else {
      ctx.pushCode('for (var {0} = 0; {0} < {1}; {0}++) {', counter, length)
    }

    if (typeof type === 'string') {
      if (!aliasRegistry[type]) {
        ctx.pushCode('var {0} = buffer.read{1}(offset);', item, NAME_MAP[type])
        ctx.pushCode('offset += {0};', PRIMITIVE_TYPES[NAME_MAP[type]])
      } else {
        let tempVar = ctx.generateTmpVariable()
        ctx.pushCode('var {0} = {1}(offset);', tempVar, FUNCTION_PREFIX + type)
        ctx.pushCode('var {0} = {1}.result; offset = {1}.offset;', item, tempVar)
        if (type !== this.alias) ctx.addReference(type)
      }
    } else if (type instanceof Parser) {
      ctx.pushCode('var {0} = {};', item)

      ctx.pushScope(item)
      type._generate(ctx)
      ctx.popScope()
    }

    if (isHash) {
      ctx.pushCode('{0}[{2}.{1}] = {2};', lhs, key, item)
    } else {
      ctx.pushCode('{0}.push({1});', lhs, item)
    }

    ctx.pushCode('}')

    if (typeof this.options.readUntil === 'function') {
      ctx.pushCode(
        ' while (!({0}).call(this, {1}, buffer.slice(offset)));',
        this.options.readUntil,
        item
      )
    }
  }

  _generateChoiceCase (ctx, varName, type) {
    if (typeof type === 'string') {
      if (!aliasRegistry[type]) {
        ctx.pushCode(
          '{0} = buffer.read{1}(offset);',
          ctx.generateVariable(this.varName),
          NAME_MAP[type]
        )
        ctx.pushCode('offset += {0};', PRIMITIVE_TYPES[NAME_MAP[type]])
      } else {
        let tempVar = ctx.generateTmpVariable()
        ctx.pushCode('var {0} = {1}(offset);', tempVar, FUNCTION_PREFIX + type)
        ctx.pushCode(
          '{0} = {1}.result; offset = {1}.offset;',
          ctx.generateVariable(this.varName),
          tempVar
        )
        if (type !== this.alias) ctx.addReference(type)
      }
    } else if (type instanceof Parser) {
      ctx.pushPath(varName)
      type._generate(ctx)
      ctx.popPath(varName)
    }
  }

  _generateChoice (ctx) {
    let tag = ctx.generateOption(this.options.tag)
    if (this.varName) {
      ctx.pushCode('{0} = {};', ctx.generateVariable(this.varName))
    }
    ctx.pushCode('switch({0}) {', tag)
    Object.keys(this.options.choices).forEach((tag) => {
      let type = this.options.choices[tag]

      ctx.pushCode('case {0}:', tag)
      this._generateChoiceCase(ctx, this.varName, type)
      ctx.pushCode('break;')
    }, this)
    ctx.pushCode('default:')
    if (this.options.defaultChoice) {
      this._generateChoiceCase(ctx, this.varName, this.options.defaultChoice)
    } else {
      ctx.generateError('"Met undefined tag value " + {0} + " at choice"', tag)
    }
    ctx.pushCode('}')
  }

  _generateNest (ctx) {
    let nestVar = ctx.generateVariable(this.varName)

    if (this.options.type instanceof Parser) {
      if (this.varName) {
        ctx.pushCode('{0} = {};', nestVar)
      }
      ctx.pushPath(this.varName)
      this.options.type._generate(ctx)
      ctx.popPath(this.varName)
    } else if (aliasRegistry[this.options.type]) {
      let tempVar = ctx.generateTmpVariable()
      ctx.pushCode(
        'var {0} = {1}(offset);',
        tempVar,
        FUNCTION_PREFIX + this.options.type
      )
      ctx.pushCode('{0} = {1}.result; offset = {1}.offset;', nestVar, tempVar)
      if (this.options.type !== this.alias) ctx.addReference(this.options.type)
    }
  }

  _generateFormatter (ctx, varName, formatter) {
    if (typeof formatter === 'function') {
      ctx.pushCode('{0} = ({1}).call(this, {0});', varName, formatter)
    }
  }

  _isInteger () {
    return !!this.type.match(/U?Int[8|16|32][BE|LE]?|Bit\d+/)
  }
}

module.exports = Parser
