#!/usr/bin/env node

const {env} = process
const cliText = process.argv.slice(2).join(`\n`)
if(!cliText) {
  console.log(`未输入查询字符`)
  process.exit()
}
translateTextToLine({
  text: cliText,
  key: env[`baidu.key`],
  appid: env[`baidu.appid`],
}).then(({str, isChinese, translateFormat, res}) => {
  const littleHumpResList = res.map((item, index) => {
    const littleHump = toLittleHump(item.en.replace(/^-*\s*/, ``)).match(/[a-zA-Z0-9]+/ig).join(``)
    return {
      ...item,
      littleHump,
    }
  })
  const resText = littleHumpResList.map(item => {
    return isChinese ? item.littleHump : item.zh
  }).join(`\n`)
  console.log(resText)
}).catch(err => console.log(`err`, err))


/**
 * 翻译多行文本并处理为数组
 * @param {object} param0
 * @param {string} param0.text 要翻译的多行文本
 * @param {string} param0.appid 百度 appid
 * @param {string} param0.key 百度 key
 */
async function translateTextToLine({ text, appid, key }) { // 翻译行
  const str = text.split(/[\r\n]/).map(item => item.trim()).filter(item => Boolean(item)).join(`\n`) // 删除多余字符
  const isChinese = escape(str.match(/(.+?)\s?/)[1]).includes(`%u`) // 查看第一个字符是不是中文
  const translateFormat = isChinese ? { from: `zh`, to: `en` } : { from: `en`, to: `zh` }

  async function translatePlatforms() {
    return new Promise(async (resolve, reject) => {
      const { google, microsoft, youdao, baidu } = require('translate-platforms')
      // - [ ] fix: youdao 错误: https://github.com/imlinhanchao/translate-platforms/issues/1
      let errInfo
      const result = await microsoft(str, translateFormat).catch(err => { errInfo = err })
        || await google(str, translateFormat).catch(err => { errInfo = err })
        || await baidu(str, translateFormat).catch(err => { errInfo = err })
        || await youdao(str, translateFormat).catch(err => { errInfo = err })
      if (errInfo) {
        console.log(`err`, errInfo)
        reject(errInfo)
      } else {
        const enArr = (isChinese ? result.text : result.word).split(`\n`)
        const zhArr = (isChinese ? result.word : result.text).split(`\n`)
        const rawArr = isChinese ? zhArr : enArr
        const handleRes = enArr.reduce((acc, cur, index) => {
          return [...acc, {
            raw: rawArr[index],
            en: cur,
            zh: zhArr[index],
          }]
        }, [])
        resolve(handleRes)
      }
    })
  }

  async function baiduTranslate({ key, appid }) {
    return new Promise(async (resolve, reject) => {
      const querystring = require('querystring')
      const cfg = {
        appid,
        key,
        q: str,
        salt: `Date.now()`,
      }
      const md5 = getMd5(`${cfg.appid}${cfg.q}${cfg.salt}${cfg.key}`)
      const paramsObj = {
        ...translateFormat,
        q: cfg.q,
        salt: cfg.salt,
        appid: cfg.appid,
        sign: md5,
      }
      const paramsUrl = querystring.stringify(paramsObj)
      const url = `https://api.fanyi.baidu.com/api/trans/vip/translate?${paramsUrl}`
      httpGet(url).then(res => {
        const handle = res.trans_result.map(item => {
          const zh = isChinese ? item.src : item.dst
          const en = isChinese ? item.dst : item.src
          const raw = isChinese ? zh : en
          return { raw, zh, en }
        })
        resolve(handle)
      }).catch(err => {
        console.log(`err`, err)
        reject(err)
      })
    })
  }

  return new Promise(async (resolve, reject) => {
    let errInfo
    let fnArr = [
      () => translatePlatforms().catch(err => { errInfo = { key: `translatePlatforms`, err } }),
      () => baiduTranslate({ key, appid }).catch(err => { errInfo = { key: `baiduTranslate`, err } }),
    ]
    fnArr = (appid && key)
      ? fnArr.reverse() // 如果传了 key, 则优先使用需要 key 的方法
      : fnArr
    const res = await fnArr[0]() || await fnArr[1]();
    res ? resolve({str, isChinese, translateFormat, res}) : reject(errInfo)
  })

}

/**
 * 转换字符为小驼峰, 支持 `空格 - _`
 * @param {string} str 要处理的字符
 */
function toLittleHump(str) {
  let arr = str.split(' ').join('-').split('-').join('_').split('_')
  for (let i = 1; i < arr.length; i++) {
    arr[i] = arr[i].charAt(0).toUpperCase() + arr[i].substring(1)
  }
  arr[0] = arr[0].toLowerCase() // 此行为小驼峰
  return arr.join('')
}

/**
 * 获取字符串的 md5
 * @param {*} str 字符串
 */
function getMd5(str) {
  const crypto = require('crypto')
  const md5 = crypto.createHash('md5')
  return md5.update(str).digest('hex')
}

/**
 * nodejs 原生发送请求
 * @param {*} url
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const https = require(url.match(/(http.?):\/\//)[1])
    https.get(url, (res) => {
      let data = ''
      res.on(`data`, (chunk) => {
        data += chunk
      })
      res.on(`end`, () => {
        resolve(JSON.parse(data))
      })
    }).on(`error`, (err) => {
      reject(err.message)
    })
  })
}
