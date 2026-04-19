import type { Request, Response } from 'express';

const settingsController = {
  getIndex(req: Request, res: Response) {
    res.render('settings/index', {
      title: 'Cài đặt',
      active: 'settings',
    });
  },
};

export = settingsController;
