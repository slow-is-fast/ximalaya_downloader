import { AbstractDownloader } from './abstractDownloader.js'
import { sleep, buildHeaders } from '../common/utils.js'
import { decrypt } from "./core/www2-decrypt.js"
import puppeteerOriginal from 'puppeteer'
import { addExtra } from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import fs from 'fs'
import { log } from '../common/log4jscf.js'
import path from 'path'
import os from 'os'
import { config } from '../common/config.js'
import { iaxios } from '../common/axioscf.js'
import { projectRoot } from '../settings.js'
import { assert } from 'console'

// 配置 puppeteer-extra
const puppeteer = addExtra(puppeteerOriginal)
puppeteer.use(StealthPlugin())

/**
 * 使用Puppeteer实现的网站下载器
 */
class PuppeteerWebSiteDownloader extends AbstractDownloader {
    constructor() {
        super('www');
        this.clientName = "喜马拉雅网页端"
        this.browser = null
        this.page = null
        this._initBrowser();
    }

    /**
     * 初始化浏览器
     * @returns {Promise<void>}
     * @private
     */
    async _initBrowser() {
        try {
            if (!this.browser) {
                this.browser = await puppeteer.launch({
                    headless: false, // 使用布尔值false确保非无头模式
                    executablePath: 'E:/scoop/apps/googlechrome/current/chrome.exe',
                    args: [
                        '--no-sandbox',
                        '--disable-blink-features=AutomationControlled',
                    ],
                    defaultViewport: null,
                    userDataDir: path.join(projectRoot, '.browser-data') // 指定用户数据目录
                })
            }
            if (!this.page) {
                this.page = await this.browser.newPage()
                // 设置视口大小
                await this.page.setViewport({ width: 1280, height: 800 })
                // 设置用户代理
                await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36')
            }

            // 确保页面已经加载到喜马拉雅网站
            try {
                const currentUrl = this.page.url();
                if (currentUrl === 'about:blank' || !currentUrl.includes('ximalaya.com')) {
                    // 导航到喜马拉雅首页
                    await this.page.goto('https://www.ximalaya.com/', {
                        waitUntil: 'domcontentloaded', // 使用更宽松的等待条件
                        timeout: 30000
                    });
                    // 等待一段时间让页面完全加载
                    await sleep(2000);
                }
            } catch (error) {
                log.error('导航到喜马拉雅首页失败:', error);
                // 如果页面已经创建但导航失败，尝试关闭并重新创建页面
                if (this.page) {
                    await this.page.close().catch(() => { });
                    this.page = await this.browser.newPage();
                    await this.page.setViewport({ width: 1280, height: 800 });
                    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
                }
            }
        } catch (error) {
            log.error('浏览器初始化过程中出错:', error)
            throw error
        }
    }

    /**
     * 关闭浏览器
     * @returns {Promise<void>}
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close()
            this.browser = null
            this.page = null
        }
    }
    /**
     * 检查是否已登录，通过调用getCurrentUser接口判断
     * @returns {Promise<boolean>}
     */
    async isLogin() {
        await this._initBrowser()
        await sleep(2000); // 减少等待时间
        try {
            // 使用getCurrentUser接口判断登录状态
            const loginResult = await this.page.evaluate(async () => {
                try {
                    const response = await fetch('https://www.ximalaya.com/revision/main/getCurrentUser', {
                        method: 'GET',
                        credentials: 'include'
                    })
                    const data = await response.json()
                    console.log(data);
                    return {
                        success: true,
                        isLoggedIn: data.data && data.data.uid && !data.data.isLoginBan,
                        userData: data.data
                    }
                } catch (error) {
                    return {
                        success: false,
                        error: error.message
                    }
                }
            })

            if (loginResult.success) {
                if (loginResult.isLoggedIn) {
                    log.info('用户已登录，用户信息:', loginResult.userData ? loginResult.userData.nickname || loginResult.userData.uid : '未获取到用户名')
                } else {
                    log.info('用户未登录')
                }
                return loginResult.isLoggedIn
            } else {
                log.error('调用getCurrentUser接口失败:', loginResult.error)
                return false
            }
        } catch (error) {
            log.error('检查登录状态失败:', error)
            return false
        }
    }

    /**
     * 获取登录二维码
     * @returns {Promise<{qrId: *, img: *}>}
     * @private
     */
    async _getQrCode() {


        return {
            qrId: '',
            img: '',
        }
    }

    /**
     * 获取登录结果
     * @param qrId
     * @returns {Promise<{cookies: *, isSuccess: boolean}|{isSuccess: boolean}>}
     * @private
     */
    async _getLoginResult(qrId) {

    }

    /**
     * 获取可用cookie
     * @returns {Promise<*>}
     * @private
     */
    async _getCookies() {
        console.error("获取cookie失败")
        return '';
    }

    /**
     * 解密音频URL
     * @param encodeText
     * @returns {*}
     * @private
     */
    _decrypt(encodeText) {
        const url = decrypt.getSoundCryptLink({ deviceType: this.deviceType, link: encodeText })
        return url
    }

    /**
     * 使用puppeteer获取专辑信息
     * @param albumId
     * @returns {Promise<{albumId, albumTitle, isFinished, trackCount}>}
     */
    async getAlbum(albumId) {
        if (albumId == null) {
            throw new Error("albumId不能为空")
        }

        // 访问专辑页面
        await this.page.goto(`https://www.ximalaya.com/album/${albumId}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000 // 增加超时时间到60秒
        })

        // 使用新的 API 接口获取专辑信息
        try {
            // 获取当前页面的cookies
            const cookies = await this.page.cookies()
            const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')

            // 使用新的 API 接口获取专辑信息
            const url = `https://www.ximalaya.com/tdk-web/seo/search/albumInfo?albumId=${albumId}`
            const referer = `${config.baseUrl}/album/${albumId}`
            const headers = buildHeaders(referer, cookieString)
            const response = await iaxios.get(url, { headers: headers })

            if (response.status === 200 && response.data && response.data.ret === 200) {
                const apiData = response.data.data

                return {
                    albumId: albumId,
                    albumTitle: apiData.albumTitle,
                    isFinished: apiData.isFinished === 1,
                    trackCount: apiData.trackCount
                }
            } else {
                log.error('API 返回错误:', response.data)
                throw new Error('API 返回错误')
            }
        } catch (error) {
            log.error('使用 API 获取专辑信息失败:', error)
        }
    }

    /**
     * 使用puppeteer获取章节列表
     * @param albumId
     * @param pageNum
     * @param pageSize
     * @returns {Promise<{trackTotalCount: *, tracks: *}>}
     */
    async getTracksList(albumId, pageNum, pageSize) {
        await this._initBrowser()

        // 访问专辑页面
        await this.page.goto(`https://www.ximalaya.com/album/${albumId}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        })

        // 拦截网络请求
        await this.page.setRequestInterception(true);

        // 监听请求
        this.page.on('request', request => {
            request.continue();
        });

        // 监听响应
        let trackData = null;
        this.page.on('response', async response => {
            const url = response.url();
            // 匹配获取声音列表的API
            if (url.includes('/revision/album/v1/getTracksList')) {
                try {
                    const data = await response.json();
                    if (data && data.ret === 200) {
                        trackData =  data.data;
                    }
                } catch (error) {
                    log.error('解析响应数据失败:', error);
                }
            }
        });

        // 等待页面加载完成
        await this.page.waitForSelector('.sound-list', { timeout: 10000 }).catch(() => {
            log.info('等待sound-list元素超时，继续执行');
        });

        // 如果通过拦截获取到数据，直接返回
        if (trackData) {
            return trackData;
        }



    }
}

export {
    PuppeteerWebSiteDownloader
}