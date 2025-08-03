import {PuppeteerWebSiteDownloader} from './handler/puppeteerWebSiteDownloader.js'
import {log} from './common/log4jscf.js'
import readline from 'readline'
import { sleep } from './common/utils.js'

async function waitForUserInput(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    
    return new Promise(resolve => {
        rl.question(message, answer => {
            rl.close()
            resolve(answer)
        })
    })
}

async function openLoginPage() {
    const downloader = new PuppeteerWebSiteDownloader();
    let browser = null


    try {
        // 自定义初始化浏览器，确保以非无头模式启动
        if (!downloader.browser) {
            throw new Error('浏览器初始化超时')
        } else {
            browser = downloader.browser
        }
        
        // 创建新页面
        const page = await browser.newPage()
        await page.setViewport({ width: 1280, height: 800 })
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36')
        
        log.info('正在打开喜马拉雅首页，请在浏览器中手动登录...')
        await page.goto('https://www.ximalaya.com/', {
            waitUntil: 'networkidle2'
        })
        
        // 等待用户手动登录
        log.info('请在浏览器中完成登录，登录成功后会自动保存会话')
        await waitForUserInput('完成登录后，按回车键继续...')
        
        // 检查登录状态
        log.info('正在检查登录状态...')
        try {
            // 使用getCurrentUser接口检查登录状态
            const loginResult = await page.evaluate(async () => {
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
            
            if (loginResult.success && loginResult.isLoggedIn) {
                const userData = loginResult.userData
                log.info(`登录成功！用户: ${userData.nickname || userData.uid || '未知用户'}`)
                log.info('浏览器会话已保存，下次运行将自动使用已登录状态。')
            } else {
                log.warn('似乎未成功登录，请检查浏览器状态。')
            }
        } catch (error) {
            log.error('检查登录状态失败:', error)
        }
    } catch (error) {
        log.error('打开登录页面过程中出错:', error)
    } finally {
        // 等待用户确认后关闭浏览器
        await waitForUserInput('按回车键关闭浏览器...')
        if (browser) {
            await browser.close()
            log.info('浏览器已关闭')
        }
    }
}

openLoginPage()