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
      return chrome.browserAction.setBadgeText({ text: '1/90'});
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
      return chrome.browserAction.setBadgeText({ text: '2/90'});
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
      return chrome.browserAction.setBadgeText({ text: '3/90'});
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
      return chrome.browserAction.setBadgeText({ text: '4/90'});
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
        id: 515455987, //andrepiresdemellopessoal
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
      return chrome.browserAction.setBadgeText({ text: '5/90'});
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
        id: 330021192, //thiagoomacedoo
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
      return chrome.browserAction.setBadgeText({ text: '6/90'});
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
      return chrome.browserAction.setBadgeText({ text: '7/90'});
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
      return chrome.browserAction.setBadgeText({ text: '8/90'});
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
      return chrome.browserAction.setBadgeText({ text: '9/90'});
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
      return chrome.browserAction.setBadgeText({ text: '10/90'});
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
      return chrome.browserAction.setBadgeText({ text: '11/90'});
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
        id: 671263638, 
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
      return chrome.browserAction.setBadgeText({ text: '12/90'});
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
        id: 639939185, //prejoaodicado
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
      return chrome.browserAction.setBadgeText({ text: '13/90'});
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
      return chrome.browserAction.setBadgeText({ text: '14/90'});
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
      return chrome.browserAction.setBadgeText({ text: '15/90'});
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
      return chrome.browserAction.setBadgeText({ text: '16/90'});
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
      return chrome.browserAction.setBadgeText({ text: '17/90'});
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
      return chrome.browserAction.setBadgeText({ text: '18/90'});
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
        id: 235779112, //lavidaloca.r
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
      return chrome.browserAction.setBadgeText({ text: '19/90'});
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
      return chrome.browserAction.setBadgeText({ text: '20/90'});
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
        id: 342335720, //_pedroleite
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
      return chrome.browserAction.setBadgeText({ text: '21/90'});
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
        id: 27841910,
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
      return chrome.browserAction.setBadgeText({ text: '22/90'});
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
        id: 55025386,
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
      return chrome.browserAction.setBadgeText({ text: '23/90'});
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
        id: 3085290718,
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
      return chrome.browserAction.setBadgeText({ text: '24/90'});
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
        id: 269564513,
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
      return chrome.browserAction.setBadgeText({ text: '25/90'});
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
        id: 45435827,
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
      return chrome.browserAction.setBadgeText({ text: '26/90'});
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
        id: 1436705341,
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
      return chrome.browserAction.setBadgeText({ text: '27/90'});
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
        id: 2030568870,
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
      return chrome.browserAction.setBadgeText({ text: '28/90'});
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
        id: 1481802381,
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
      return chrome.browserAction.setBadgeText({ text: '29/90'});
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
        id: 1362809416,
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
      return chrome.browserAction.setBadgeText({ text: '30/90'});
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
        id: 3501377691,
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
      return chrome.browserAction.setBadgeText({ text: '31/90'});
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
        id: 6293166246,
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
      return chrome.browserAction.setBadgeText({ text: '32/90'});
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
        id: 21050222,
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
      return chrome.browserAction.setBadgeText({ text: '33/90'});
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
        id: 4618823558,
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
      return chrome.browserAction.setBadgeText({ text: '34/90'});
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
        id: 198278833,
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
      return chrome.browserAction.setBadgeText({ text: '35/90'});
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
        id: 47621063,
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
      return chrome.browserAction.setBadgeText({ text: '36/90'});
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
        id: 190714054,
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
      return chrome.browserAction.setBadgeText({ text: '37/90'});
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
        id: 3606071884,
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
      return chrome.browserAction.setBadgeText({ text: '38/90'});
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
        id: 260897776,
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
      return chrome.browserAction.setBadgeText({ text: '39/90'});
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
        id: 5430988517,
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
      return chrome.browserAction.setBadgeText({ text: '40/90'});
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
        id: 3858554117,
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
      return chrome.browserAction.setBadgeText({ text: '41/90'});
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
        id: 43431321,
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
      return chrome.browserAction.setBadgeText({ text: '42/90'});
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
        id: 1466018617,
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
      return chrome.browserAction.setBadgeText({ text: '43/90'});
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
        id: 1436091172,
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
      return chrome.browserAction.setBadgeText({ text: '44/90'});
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
        id: 5484528502,
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
      return chrome.browserAction.setBadgeText({ text: '45/90'});
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
        id: 2067005208,
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
      return chrome.browserAction.setBadgeText({ text: '46/90'});
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
        id: 309946970,
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
      return chrome.browserAction.setBadgeText({ text: '47/90'});
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
        id: 3083096049,
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
      return chrome.browserAction.setBadgeText({ text: '48/90'});
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
        id: 4174173294,
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
      return chrome.browserAction.setBadgeText({ text: '49/90'});
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
        id: 32098337,
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
      return chrome.browserAction.setBadgeText({ text: '50/90'});
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
        id: 804417790,
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
      return chrome.browserAction.setBadgeText({ text: '51/90'});
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
        id: 818103813,
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
      return chrome.browserAction.setBadgeText({ text: '52/90'});
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
        id: 16866721,
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
      return chrome.browserAction.setBadgeText({ text: '53/90'});
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
        id: 2257956089,
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
      return chrome.browserAction.setBadgeText({ text: '54/90'});
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
        id: 7100168721,
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
      return chrome.browserAction.setBadgeText({ text: '55/90'});
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
        id: 201243559,
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
      return chrome.browserAction.setBadgeText({ text: '56/90'});
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
        id: 5485842433,
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
      return chrome.browserAction.setBadgeText({ text: '57/90'});
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
        id: 316175383,
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
      return chrome.browserAction.setBadgeText({ text: '58/90'});
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
        id: 5506980762,
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
      return chrome.browserAction.setBadgeText({ text: '59/90'});
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
        id: 5344180706,
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
      return chrome.browserAction.setBadgeText({ text: '60/90'});
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
        id: 2009338251,
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
      return chrome.browserAction.setBadgeText({ text: '61/90'});
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
        id: 215811438,
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
      return chrome.browserAction.setBadgeText({ text: '62/90'});
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
        id: 4564158380,
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
      return chrome.browserAction.setBadgeText({ text: '63/90'});
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
        id: 6812797236,
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
      return chrome.browserAction.setBadgeText({ text: '64/90'});
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
        id: 2911507486,
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
      return chrome.browserAction.setBadgeText({ text: '65/90'});
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
        id: 20319818,
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
      return chrome.browserAction.setBadgeText({ text: '66/90'});
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
        id: 443929683,
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
      return chrome.browserAction.setBadgeText({ text: '67/90'});
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
        id: 50730461,
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
      return chrome.browserAction.setBadgeText({ text: '68/90'});
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
        id: 528922989,
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
      return chrome.browserAction.setBadgeText({ text: '69/90'});
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
        id: 2491409497,
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
      return chrome.browserAction.setBadgeText({ text: '70/90'});
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
        id: 6684493267,
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
      return chrome.browserAction.setBadgeText({ text: '71/90'});
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
        id: 471128921,
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
      return chrome.browserAction.setBadgeText({ text: '72/90'});
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
        id: 143987090,
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
      return chrome.browserAction.setBadgeText({ text: '73/90'});
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
        id: 1929203490,
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
      return chrome.browserAction.setBadgeText({ text: '74/90'});
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
        id: 37754671,
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
      return chrome.browserAction.setBadgeText({ text: '75/90'});
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
        id: 1861652,
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
      return chrome.browserAction.setBadgeText({ text: '76/90'});
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
        id: 1127251804,
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
      return chrome.browserAction.setBadgeText({ text: '77/90'});
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
        id: 7848465905,
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
      return chrome.browserAction.setBadgeText({ text: '78/90'});
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
        id: 353358413,
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
      return chrome.browserAction.setBadgeText({ text: '79/90'});
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
        id: 215749679,
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
      return chrome.browserAction.setBadgeText({ text: '80/90'});
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
        id: 217178013,
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
      return chrome.browserAction.setBadgeText({ text: '81/90'});
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
        id: 1212284440,
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
      return chrome.browserAction.setBadgeText({ text: '82/90'});
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
        id: 823988143,
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
      return chrome.browserAction.setBadgeText({ text: '83/90'});
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
        id: 7951036943,
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
      return chrome.browserAction.setBadgeText({ text: '84/90'});
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
        id: 3068747,
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
      return chrome.browserAction.setBadgeText({ text: '85/90'});
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
        id: 1592430577,
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
      return chrome.browserAction.setBadgeText({ text: '86/90'});
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
        id: 38500474, // ID QUE A PIRANHA DIZ QUE ESTA REPETIDO KKKKK SE TIVESSE REPETIDO TERIA 1 MATCH
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
      return chrome.browserAction.setBadgeText({ text: '87/90'});
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
        id: 1090168293,
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
      return chrome.browserAction.setBadgeText({ text: '88/90'});
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
        id: 8213716324,
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
      return chrome.browserAction.setBadgeText({ text: '89/90'});
    });
				}, 354000);
  }
////////////////////////////////////  




//////////////////////////////////// 
  feed89(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
chrome.browserAction.setBadgeText({text: '90/90'});
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 3071326891,
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
      return chrome.browserAction.setBadgeText({text: ''});
    });
				}, 358000);
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
		
////////////////////////////////////
      }
      return res;
    });
  }
}

window.Fetcher = Fetcher;
