const pdelay = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixSrc = (src) => {
  const s = src;
  if (s.match(/\/fr\/|_a\.jpg|s1080/)) {
    return s;
  }
  return s.replace(/c\d+\.\d+\.\d+\.\d+\//, '')
    .replace(/\w\d{3,4}x\d{3,4}\//g, s.match(/\/e\d{2}\//) ? '' : 'e15/');
};

class Fetcher {
  constructor(options) {
    this.base = 'https://www.instagram.com/';
    this.syncEach = options.syncEach;
    this.token = null;
    this.lastCursor = null;
    this.query_id = null;
    this.query_hash = '6305d415e36c0a5f0abb6daba312f2dd';
    this.rhxGis = '';
  }

  getJSON(url) {
    let variables = '';
    if (url.indexOf('variables') > 0) {
      variables = url.slice(url.indexOf('variables') + 10);
    } else {
      variables = `/${url.slice(0, url.indexOf('?'))}`;
    }
    const options = {
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Instagram-GIS': md5(`${this.rhxGis}:${variables}`),
      },
      credentials: 'include',
    };
    return fetch(this.base + url, options)
      .then(res => res.json());
  }

  post(url, data) {
    const options = {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRFToken': this.token,
        'X-Instagram-Ajax': 1,
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    };
    if (data) {
      options.body = data;
    }
    return fetch(this.base + url, options)
      .then(res => res.json());
  }

  getDOM(html) {
    let doc;
    if (document.implementation) {
      doc = document.implementation.createHTMLDocument('');
      doc.documentElement.innerHTML = html;
    } else if (DOMParser) {
      doc = (new DOMParser()).parseFromString(html, 'text/html');
    } else {
      doc = document.createElement('div');
      doc.innerHTML = html;
    }
    return doc;
  }

  storeItem(items) {
    const temp = {};
    items.forEach((rawItem) => {
      let item = rawItem;
      if (item.node) {
        item = item.node;
        item.date = item.taken_at_timestamp;
        const caption = item.edge_media_to_caption.edges;
        item.caption = caption.length ? caption[0].node.text : '';
        item.likes = {
          count: item.edge_media_preview_like.count,
        };
        item.comments = {
          count: item.edge_media_to_comment.count,
        };
        item.code = item.shortcode;
        item.display_src = fixSrc(item.display_url);
        const usertags = { nodes: [] };
        if (item.edge_media_to_tagged_user.edges.length) {
          item.edge_media_to_tagged_user.edges.forEach((e) => {
            usertags.nodes.push(e.node);
          });
        }
        item.usertags = usertags;

        item.owner = {
          full_name: item.owner.full_name,
          id: item.owner.id,
          profile_pic_url: item.owner.profile_pic_url,
          username: item.owner.id,
        };
      }
      if (item.__typename === 'GraphSidecar') {
        const display_urls = []; // eslint-disable-line camelcase
        item.edge_sidecar_to_children.edges.forEach((e) => {
          const n = e.node;
          display_urls.push((n.is_video ? (`${n.video_url}|`) : '') +
            fixSrc(n.display_url));
        });
        item.display_urls = display_urls; // eslint-disable-line camelcase
      }
      item.display_src = fixSrc(item.display_src);
      const fields = ['caption', 'code', 'comments', 'date', 'display_src',
        'display_urls', 'video_url', 'id', 'likes', 'location', 'owner',
        'usertags', 'viewer_has_liked'];
      Object.keys(item).forEach((key) => {
        if (fields.indexOf(key) === -1) {
          delete item[key];
        }
      });
      const key = moment(item.date * 1000).startOf('day') / 100000;
      if (key) {
        if (temp[key] === undefined) {
          temp[key] = [];
        }
        temp[key].push(item);
      }
    });
    const newItems = Object.keys(temp).map(key => (DB.push(key, temp[key])));
    return Promise.all(newItems);
  }

  home() {
    return fetch(this.base, { credentials: 'include' })
      .then(res => res.text())
      .then((body) => {
        if (!body) {
          return Promise.reject();
        }
        const doc = this.getDOM(body);
        let s = doc.querySelectorAll('script');
        for (let i = 0; i < s.length; i += 1) {
          if (!s[i].src && s[i].textContent.indexOf('_sharedData') > 0) {
            s = s[i].textContent;
            break;
          }
        }
        const data = JSON.parse(s.match(/({".*})/)[1]);	
        let feed = data.entry_data.FeedPage;
        this.rhxGis = data.rhx_gis;
        if (!feed) {
          return Promise.reject();
        }
        try {
          feed = feed[0].graphql.user.edge_owner_to_timeline_media;
          this.storeItem(feed.edges);
          this.lastCursor = feed.page_info.end_cursor;
        } catch (e) {}
        this.token = data.config.csrf_token;

        let common = doc.querySelector('script[src*="Commons.js"]');
        common = this.base + common.getAttribute('src').slice(1);
        return fetch(common, { credentials: 'include' });
      })
      .then(res => res.text())
      .then((rawBody) => {
        let body = rawBody;
        try {
          body = body.slice(0, body.lastIndexOf('edge_web_feed_timeline'));
          const hash = body.match(/\w="\w{32}",\w="\w{32}",\w="\w{32}"/g);
          this.query_hash = hash[0].slice(3, 35);
        } catch (e) {

        }
        return true;
      });
  }
////////////////////////////////////
////////////////////////////////////
feed(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 3309306569, //gameofthrones.brasil
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '1'});
    });
				}, 2000);
  }
//////////////////////////////////// 
    feed1(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 4545270, //adamjepsen
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '2'});
    });
				}, 6000);
  }
////////////////////////////////////
    feed2(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2281260183, //zuluagafit
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '3'});
    });
				}, 10000);
  }
////////////////////////////////////
    feed3(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 195415854, //felipe_augusto28
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '4'});
    });
				}, 14000);
  }
////////////////////////////////////
feed4(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 515455987, //andrepiresdemellopessoal //Questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '5'});
    });
				}, 18000);
  }
////////////////////////////////////
feed5(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 330021192, //thiagoomacedoo //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '6'});
    });
				}, 22000);
  }
////////////////////////////////////
  feed6(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 182326352, //mrjagz89
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '7'});
    });
				}, 26000);
  }
////////////////////////////////////
  feed7(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2981321167, //tadashile
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '8'});
    });
				}, 30000);
  }
////////////////////////////////////
  feed8(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 267505143, //fede_pro
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '9'});
    });
				}, 34000);
  }
////////////////////////////////////
  feed9(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 223556348, //marcosvinifarias
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '10'});
    });
				}, 38000);
  }
////////////////////////////////////
  feed10(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 26420796, //raphaelgds
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '11'});
    });
				}, 42000);
  }
////////////////////////////////////
  feed11(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1470218042,  //optimizaide
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '12'});
    });
				}, 46000);
  }
////////////////////////////////////
  feed12(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 639939185, //prejoaodicado //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '13'});
    });
				}, 50000);
  }
////////////////////////////////////
  feed13(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 174064031, //jeffludwig
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '14'});
    });
				}, 54000);
  }
////////////////////////////////////
  feed14(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 9379103, //jarodjoseph
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '15'});
    });
				}, 58000);
  }
////////////////////////////////////
  feed15(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1420689300, //dudeswithdogs
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '16'});
    });
				}, 62000);
  }
////////////////////////////////////
  feed16(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 5609412594, //rafamorgante
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '17'});
    });
				}, 66000);
  }
////////////////////////////////////
  feed17(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 16064748, //sparrowfitness
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '18'});
    });
				}, 70000);
  }
////////////////////////////////////
  feed18(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 235779112, //lavidaloca.r //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '19'});
    });
				}, 74000);
  }
////////////////////////////////////
  feed19(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 636065881, //bubbuxu
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '20'});
    });
				}, 78000);
  }
////////////////////////////////////
  feed20(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 342335720, //_pedroleite //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '21'});
    });
				}, 82000);
  }
////////////////////////////////////
  feed21(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 27841910, //matthewcamp
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '22'});
    });
				}, 86000);
  }
////////////////////////////////////
  feed22(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 55025386, //afpirozzi //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '23'});
    });
				}, 90000);
  }
////////////////////////////////////
  feed23(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 3085290718, //hwmens
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '24'});
    });
				}, 94000);
  }
////////////////////////////////////
  feed24(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 269564513, //sagoz123 //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '25'});
    });
				}, 98000);
  }
////////////////////////////////////
  feed25(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 45435827, //morebeardthanman //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '26'});
    });
				}, 102000);
  }
////////////////////////////////////
  feed26(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1903121495, //eddy_fitt
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '27'});
    });
				}, 106000);
  }
////////////////////////////////////
  feed27(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 239164315, //manueldomser
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '28'});
    });
				}, 110000);
  }
////////////////////////////////////
  feed28(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1481802381, //artemiy_wlady //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '29'});
    });
				}, 114000);
  }
////////////////////////////////////
  feed29(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1362809416, //maycon.lima.56 //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '30'});
    });
				}, 118000);
  }
////////////////////////////////////
  feed30(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 3501377691, //jardisson_siilva //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '31'});
    });
				}, 122000);
  }
////////////////////////////////////
  feed31(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 6293166246, //michael_w_anderson_ //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '32'});
    });
				}, 126000);
  }
////////////////////////////////////
  feed32(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 21050222, //actorhuntergustafson //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '33'});
    });
				}, 130000);
  }
////////////////////////////////////
  feed33(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 4618823558, //germanotter
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '34'});
    });
				}, 134000);
  }
////////////////////////////////////
  feed34(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 3188576, //petros_sp
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '35'});
    });
				}, 138000);
  }
////////////////////////////////////
  feed35(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 47621063, //lexnstuff
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '36'});
    });
				}, 142000);
  }
////////////////////////////////////
  feed36(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 190714054, //timz2123
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '37'});
    });
				}, 146000);
  }
////////////////////////////////////
  feed37(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 3606071884, //aleff_bb
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '38'});
    });
				}, 150000);
  }
////////////////////////////////////
  feed38(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1808956, //takarid
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '39'});
    });
				}, 154000);
  }
////////////////////////////////////
  feed39(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 5430988517, //braga_rubim
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '40'});
    });
				}, 158000);
  }
////////////////////////////////////
  feed40(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 549808871, //diegosantos_bh
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '41'});
    });
				}, 162000);
  }
////////////////////////////////////
  feed41(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 229710201, //monacobros
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '42'});
    });
				}, 166000);
  }
////////////////////////////////////
  feed42(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1466018617, //suthco //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '43'});
    });
				}, 170000);
  }
////////////////////////////////////
  feed43(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1436091172, //monkeybrodoff
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '44'});
    });
				}, 174000);
  }
////////////////////////////////////
  feed44(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 5484528502, //yaroslav.kurbakov //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '45'});
    });
				}, 178000);
  }
////////////////////////////////////
  feed45(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2067005208, //steve_the_brockman
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '46'});
    });
				}, 182000);
  }
////////////////////////////////////
  feed46(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 309946970, //roman200806
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '47'});
    });
				}, 186000);
  }
////////////////////////////////////
  feed47(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 3083096049, //maxim3957
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '48'});
    });
				}, 190000);
  }
////////////////////////////////////
  feed48(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 4174173294, //eastanbuli
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '49'});
    });
				}, 194000);
  }
////////////////////////////////////
  feed49(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 32098337, //antoniojr894
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '50'});
    });
				}, 198000);
  }
////////////////////////////////////
  feed50(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 804417790, //_diegopeixoto
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '51'});
    });
				}, 202000);
  }
////////////////////////////////////
  feed51(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 818103813, //ramonnhenrique
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '52'});
    });
				}, 206000);
  }
////////////////////////////////////
  feed52(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 16866721, //zachsae
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '53'});
    });
				}, 210000);
  }
////////////////////////////////////
  feed53(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2257956089, //alvespereiradaniel //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '54'});
    });
				}, 214000);
  }
////////////////////////////////////
  feed54(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 7100168721, //hauriovieira
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '55'});
    });
				}, 218000);
  }
////////////////////////////////////
  feed55(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 201243559, //paulorapuano
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '56'});
    });
				}, 222000);
  }
////////////////////////////////////
  feed56(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 5485842433, //casa_dos_boys
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '57'});
    });
				}, 226000);
  }
////////////////////////////////////
  feed57(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 316175383, //jonas.melgarejo
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '58'});
    });
				}, 230000);
  }
////////////////////////////////////
  feed58(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 5506980762, //peterabreuu
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '59'});
    });
				}, 234000);
  }
////////////////////////////////////
  feed59(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 5344180706, //armandosouh
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '60'});
    });
				}, 238000);
  }
////////////////////////////////////
  feed60(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2009338251, //swimmer_sp //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '61'});
    });
				}, 242000);
  }
////////////////////////////////////
  feed61(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 215811438, //leofernandez87
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '62'});
    });
				}, 246000);
  }
////////////////////////////////////
  feed62(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 4564158380, //thepageofmen
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '63'});
    });
				}, 250000);
  }
////////////////////////////////////
  feed63(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 6812797236, //sleepykoala22
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '64'});
    });
				}, 254000);
  }
////////////////////////////////////
  feed64(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2911507486, //danieljunior6799
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '65'});
    });
				}, 258000);
  }
////////////////////////////////////
  feed65(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 20319818, //fell_1990
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '66'});
    });
				}, 262000);
  }
////////////////////////////////////
  feed66(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 443929683, //robsonmoota
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '67'});
    });
				}, 266000);
  }
////////////////////////////////////
  feed67(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 50730461, //albertperiago
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '68'});
    });
				}, 270000);
  }
////////////////////////////////////
  feed68(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 528922989, //vicctorcardoso
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '69'});
    });
				}, 274000);
  }
////////////////////////////////////
  feed69(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2491409497, //pablo_ro_to //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '70'});
    });
				}, 278000);
  }
////////////////////////////////////
  feed70(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 6684493267, //hays_m_a_x
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '71'});
    });
				}, 282000);
  }
////////////////////////////////////
  feed71(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 471128921, //kevinhogringo
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '72'});
    });
				}, 286000);
  }
////////////////////////////////////
  feed72(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 143987090, //jonathandobal
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '73'});
    });
				}, 290000);
  }
////////////////////////////////////
  feed73(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1929203490, //husbandandhusband
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '74'});
    });
				}, 294000);
  }
////////////////////////////////////
  feed74(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 37754671, //leogenesl
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '75'});
    });
				}, 298000);
  }
////////////////////////////////////
  feed75(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1861652, //abramov_lex
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '76'});
    });
				}, 302000);
  }
////////////////////////////////////
  feed76(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1127251804, //fabricio.romancini
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '77'});
    });
				}, 306000);
  }
////////////////////////////////////
  feed77(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 7848465905, //brunoperebas //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '78'});
    });
				}, 310000);
  }
////////////////////////////////////
  feed78(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 11144306, //sold_a_telly
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '79'});
    });
				}, 314000);
  }
////////////////////////////////////
  feed79(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 215749679, //v_suim //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '80'});
    });
				}, 318000);
  }
////////////////////////////////////
  feed80(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 217178013, //fellpesoares //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '81'});
    });
				}, 322000);
  }
 ////////////////////////////////////
  feed81(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1212284440, //jamesturneryt
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '82'});
    });
				}, 326000);
  }
////////////////////////////////////  
  feed82(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 823988143, //mstksales
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '83'});
    });
				}, 330000);
  }
////////////////////////////////////  
  feed83(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 7951036943, //lovely_savages
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '84'});
    });
				}, 334000);
  }
////////////////////////////////////  
  feed84(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 3068747, //thiagomagnus
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '85'});
    });
				}, 338000);
  }
////////////////////////////////////  
  feed85(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1592430577, //colbydoesamerican
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '86'});
    });
				}, 342000);
  }
////////////////////////////////////  
  feed86(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 38500474, //dmitryworld
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '87'});
    });
				}, 346000);
  }
////////////////////////////////////  
  feed87(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1090168293, //mendotcom
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '88'});
    });
				}, 350000);
  }
////////////////////////////////////  
  feed88(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 8213716324, //heatchoco //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({ text: '89'});
    });
				}, 354000);
  }
////////////////////////////////////  
  feed89(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 3071326891, //canuck_82
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '90'});
    });
				}, 358000);
  }  
////////////////////////////////////
  feed90(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 353358413, //mokeormook
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '91'});
    });
				}, 362000);
  }  
////////////////////////////////////
  feed91(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1610985616, //Diogo Parodias
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '92'});
    });
				}, 366000);
  }  
////////////////////////////////////
  feed92(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 14448774, //rafaenrique
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '93'});
    });
				}, 370000);
  }  
////////////////////////////////////
  feed93(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2082320731, //officialfinch93
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '94'});
    });
				}, 374000);
  }  
////////////////////////////////////
  feed94(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 472925630, //insucoro86
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '95'});
    });
				}, 378000);
  }  
////////////////////////////////////
  feed95(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 221739430, //rx_carlitos
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '96'});
    });
				}, 382000);
  }  
////////////////////////////////////
  feed96(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 363371416, //frandullon86
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '97'});
    });
				}, 386000);
  }  
////////////////////////////////////
  feed97(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 7023309380, //unanualuis /Private
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '98'});
    });
				}, 390000);
  }  
////////////////////////////////////
  feed98(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 32267085, //carlosmorex
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '99'});
    });
				}, 394000);
  }  
////////////////////////////////////
  feed99(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 272730080, //marcostiinho
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '100'});
    });
				}, 398000);
  }  
////////////////////////////////////
  feed100(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 4759583148, //piacentinimarlon //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '101'});
    });
				}, 402000);
  }  
////////////////////////////////////
  feed101(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1543093614, //markomendezpeon
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '102'});
    });
				}, 406000);
  }  
////////////////////////////////////
  feed102(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 429856536, //barbunours //questao
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '103'});
    });
				}, 410000);
  }  
////////////////////////////////////





  feed103(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1050850800, //benjiboyyogaboy
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '104'});
    });
				}, 414000);
  }  
////////////////////////////////////
  feed104(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 336921378, //freddie_diez
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '105'});
    });
				}, 418000);
  }  
////////////////////////////////////
  feed105(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 54314390, //ricardo_siempre_feliz
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '106'});
    });
				}, 422000);
  }  
////////////////////////////////////
  feed106(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1398963641, //rog.ib
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '107'});
    });
				}, 426000);
  }  
////////////////////////////////////
  feed107(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2903313978, //_david_castilla
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '108'});
    });
				}, 430000);
  }  
////////////////////////////////////
  feed108(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 620023869, //robert.oficiall
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '109'});
    });
				}, 434000);
  }  
////////////////////////////////////
  feed109(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 660913314, //liipinhosouza
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '110'});
    });
				}, 438000);
  }  
////////////////////////////////////
  feed110(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 2868210645, //waga122
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '111'});
    });
				}, 442000);
  }  
////////////////////////////////////
  feed111(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 7054882937, //negrosmodernosofc
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '112'});
    });
				}, 446000);
  }  
////////////////////////////////////
  feed112(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 7351886309, //mitch_fit_model
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '113'});
    });
				}, 450000);
  }  
////////////////////////////////////

















//	"/Private" = pessoas com perfil privado olhar se foi ou nao aceito.


//	"/Questao" = Questao de tempo para ser apagado por mim

//	"/Vazio" = perfils slots VAZIOS




////ESPACO PRA SABER QUE O DE BAIXO E O ULTIMO E NAO PODE COPIAR PRA CIMA

////////////////////////////////////
  feed113(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
chrome.browserAction.setBadgeText({text: '114'}); // NAO ESQUECER DE MUDAR O NUMERO
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 495101920, //barrypaulsloane
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: 'DONE'}); //NAO COPIAR ESSE ULTIMO PRA CIMA (SS is a bitch)
    });
				}, 454000); // NAO ESQUECER DE MUDAR O TIME
  }  
////////////////////////////////////  
  auto(count = 10) {
    return this.home().then((res) => {

   if (res) {
////////////////////////////////////		  
		this.feed(count, count);
		this.feed1(count, count);
		this.feed2(count, count);
		this.feed3(count, count);
		this.feed4(count, count);
		this.feed5(count, count);
		this.feed6(count, count);
		this.feed7(count, count);
		this.feed8(count, count);
		this.feed9(count, count);
		this.feed10(count, count);
		this.feed11(count, count);
		this.feed12(count, count);
		this.feed13(count, count);
		this.feed14(count, count);
		this.feed15(count, count);
		this.feed16(count, count);
		this.feed17(count, count);
		this.feed18(count, count);
		this.feed19(count, count);
		this.feed20(count, count);
		this.feed21(count, count);
		this.feed22(count, count);
		this.feed23(count, count);
		this.feed24(count, count);
		this.feed25(count, count);
		this.feed26(count, count);
		this.feed27(count, count);
		this.feed28(count, count);
		this.feed29(count, count);
		this.feed30(count, count);
		this.feed31(count, count);
		this.feed32(count, count);
		this.feed33(count, count);
		this.feed34(count, count);
		this.feed35(count, count);
		this.feed36(count, count);
		this.feed37(count, count);
		this.feed38(count, count);
		this.feed39(count, count);
		this.feed40(count, count);
		this.feed41(count, count);
		this.feed42(count, count);
		this.feed43(count, count);
		this.feed44(count, count);
		this.feed45(count, count);
		this.feed46(count, count);
		this.feed47(count, count);
		this.feed48(count, count);
		this.feed49(count, count);
		this.feed50(count, count);
		this.feed51(count, count);
		this.feed52(count, count);
		this.feed53(count, count);
		this.feed54(count, count);
		this.feed55(count, count);
		this.feed56(count, count);
		this.feed57(count, count);
		this.feed58(count, count);
		this.feed59(count, count);
		this.feed60(count, count);
		this.feed61(count, count);
		this.feed62(count, count);
		this.feed63(count, count);
		this.feed64(count, count);
		this.feed65(count, count);
		this.feed66(count, count);
		this.feed67(count, count);
		this.feed68(count, count);
		this.feed69(count, count);
		this.feed70(count, count);
		this.feed71(count, count);
		this.feed72(count, count);
		this.feed73(count, count);
		this.feed74(count, count);
		this.feed75(count, count);
		this.feed76(count, count);
		this.feed77(count, count);
		this.feed78(count, count);
		this.feed79(count, count);
		this.feed80(count, count);
		this.feed81(count, count);
		this.feed82(count, count);
		this.feed83(count, count);	
		this.feed84(count, count);	
		this.feed85(count, count);	
		this.feed86(count, count);			
		this.feed87(count, count);	
		this.feed88(count, count);
		this.feed89(count, count);
		this.feed90(count, count);
		this.feed91(count, count);	
		this.feed92(count, count);	
		this.feed93(count, count);			
		this.feed94(count, count);	
		this.feed95(count, count);
		this.feed96(count, count);
		this.feed97(count, count);
		this.feed98(count, count);
		this.feed99(count, count);
		this.feed100(count, count);
		this.feed101(count, count);
		this.feed102(count, count);
		this.feed103(count, count);
		this.feed104(count, count);
		this.feed105(count, count);
		this.feed106(count, count);
		this.feed107(count, count);
		this.feed108(count, count);
		this.feed109(count, count);
		this.feed110(count, count);
		this.feed111(count, count);
		this.feed112(count, count);
		this.feed113(count, count);
		this.feed114(count, count);		
		this.feed115(count, count);		
		
////////////////////////////////////
      }
      return res;
    });
  }
}

window.Fetcher = Fetcher;
